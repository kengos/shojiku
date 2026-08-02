//! A loaded font face: glyph mapping, advance measurement, and
//! outline extraction (y-down, cubics only) for pixel backends.

use shojiku_core::{FontStyle, FontWeight};
use shojiku_image::PathCmd;
use skrifa::instance::{LocationRef, Size};
use skrifa::outline::DrawSettings;
use skrifa::{FontRef, GlyphId, MetadataProvider};
use std::path::Path;
use std::sync::Arc;

use self::pen::PathPen;
use super::FontError;

pub(super) mod decoration;
mod metrics;
mod pen;

/// A loaded font face with owned data (shared with the PDF renderer for
/// embedding).
///
/// skrifa's `FontRef` borrows the byte buffer, so it cannot be stored next
/// to it; the unscaled vertical metrics are captured once at construction
/// and glyph lookups re-borrow the (already validated) bytes per call.
pub struct FontFace {
    pub id: String,
    pub data: Arc<Vec<u8>>,
    units_per_em: f64,
    ascent_units: f64,
    /// Baseline-to-descender-bottom distance in font units, kept as the
    /// raw (usually negative) skrifa value; [`Self::descent`] returns its
    /// downward magnitude in pt.
    descent_units: f64,
    /// Baseline-to-cap-top distance in font units from OS/2 `sCapHeight`;
    /// `None` when the face omits it (common for CJK-only faces), in which
    /// case [`Self::cap_height`] falls back to a conventional ratio.
    cap_height_units: Option<f64>,
    /// `(offset, thickness)` in font units from the post table, y-up
    /// (negative offset = below baseline); `None` when the font omits it.
    underline_units: Option<(f64, f64)>,
    /// `(offset, thickness)` from OS/2 strikeout metrics, y-up.
    strikeout_units: Option<(f64, f64)>,
    // Variant keys: which (family, weight, style) this face provides,
    // so `FontStore` can pick a real bold/italic face over the synthetic
    // fallback. Default `family = id`, `weight`/`style = normal`.
    family: String,
    weight: FontWeight,
    style: FontStyle,
    /// HarfBuzz shaping tables, precomputed once per face (kerning,
    /// ligatures, complex scripts). `None` only if the bytes fail to
    /// re-parse as a harfrust font — the shaper then degrades to the
    /// per-char advance path (`super::shape`). Shaping caches use atomics,
    /// so this stays `Send + Sync` (faces live in a shared store).
    shaper_data: Option<harfrust::ShaperData>,
}

impl FontFace {
    pub fn from_bytes(id: impl Into<String>, data: Vec<u8>) -> Result<Self, FontError> {
        let id = id.into();
        let data = Arc::new(data);
        let font = FontRef::from_index(&data, 0).map_err(|source| FontError::Parse {
            id: id.clone(),
            source,
        })?;
        let metrics = font.metrics(Size::unscaled(), LocationRef::default());
        let decoration = |d: Option<skrifa::metrics::Decoration>| {
            d.map(|d| (f64::from(d.offset), f64::from(d.thickness)))
        };
        // Precompute the shaping tables from the same (validated) bytes.
        // `.ok().map(...)` on one line: the success path runs it; a parse
        // failure here (skrifa already accepted index 0) leaves `None` and
        // the shaper degrades per-char.
        let shaper_data = harfrust::FontRef::from_index(&data, 0)
            .ok()
            .map(|font| harfrust::ShaperData::new(&font));
        Ok(Self {
            family: id.clone(),
            id,
            data,
            units_per_em: f64::from(metrics.units_per_em),
            ascent_units: f64::from(metrics.ascent),
            descent_units: f64::from(metrics.descent),
            cap_height_units: metrics.cap_height.map(f64::from),
            underline_units: decoration(metrics.underline),
            strikeout_units: decoration(metrics.strikeout),
            weight: FontWeight::Normal,
            style: FontStyle::Normal,
            shaper_data,
        })
    }

    /// The precomputed HarfBuzz shaping tables, or `None` if the face's
    /// bytes did not re-parse for shaping (the caller falls back to the
    /// per-char advance path).
    pub(crate) fn shaper_data(&self) -> Option<&harfrust::ShaperData> {
        self.shaper_data.as_ref()
    }

    /// Units per em (the shaping scale divisor: harfrust returns positions
    /// in font units, scaled to pt by `size / units_per_em`).
    pub(crate) fn units_per_em(&self) -> f64 {
        self.units_per_em
    }

    /// Sets this face's variant keys (from the pack manifest); chained
    /// after `load`/`from_bytes`. `family` defaults to the id otherwise.
    pub fn with_variant(mut self, family: String, weight: FontWeight, style: FontStyle) -> Self {
        self.family = family;
        self.weight = weight;
        self.style = style;
        self
    }

    /// The family this face belongs to (defaults to `id`).
    pub fn family(&self) -> &str {
        &self.family
    }

    /// This face's declared weight / style.
    pub fn weight(&self) -> FontWeight {
        self.weight
    }
    pub fn style(&self) -> FontStyle {
        self.style
    }

    pub fn load(id: impl Into<String>, path: &Path) -> Result<Self, FontError> {
        let bytes = std::fs::read(path).map_err(|source| FontError::Io {
            path: path.display().to_string(),
            source,
        })?;
        Self::from_bytes(id, bytes)
    }

    /// Ascent in pt at the given font size.
    pub fn ascent(&self, size: f64) -> f64 {
        self.ascent_units / self.units_per_em * size
    }

    /// Nominal glyph id for a char, if the face maps it. The PDF renderer
    /// uses this to draw the same glyphs measurement was based on.
    pub fn glyph_id(&self, c: char) -> Option<u32> {
        let font = FontRef::from_index(&self.data, 0).ok()?;
        Some(font.charmap().map(c)?.to_u32())
    }

    /// Horizontal advance of one char in pt, if the face has a glyph for it.
    pub fn char_advance(&self, c: char, size: f64) -> Option<f64> {
        // Re-parsing is a table-directory walk over bytes `from_bytes`
        // already validated; `.ok()?` keeps the impossible branch on an
        // always-executed line instead of a dead arm.
        let font = FontRef::from_index(&self.data, 0).ok()?;
        let glyph = font.charmap().map(c)?;
        let advance = font
            .glyph_metrics(Size::unscaled(), LocationRef::default())
            .advance_width(glyph)?;
        Some(f64::from(advance) / self.units_per_em * size)
    }

    /// Authoritative advance of one char in pt. Unlike [`char_advance`],
    /// this never returns `None`: a char the face cannot map degrades to
    /// 0.6em. This is the single home of the missing-glyph width policy —
    /// wrapping and every renderer route through it so the width layout
    /// reserved and the width drawn can never disagree.
    ///
    /// [`char_advance`]: Self::char_advance
    pub fn advance(&self, c: char, size: f64) -> f64 {
        self.char_advance(c, size).unwrap_or(size * 0.6)
    }

    /// Width of a string in pt: the sum of [`advance`](Self::advance) plus
    /// `letter_spacing` after every character (CSS `letter-spacing`
    /// semantics, trailing character included). Must agree with
    /// [`positioned_glyphs`](Self::positioned_glyphs) so measurement and
    /// drawing can never drift.
    pub fn text_width(&self, text: &str, size: f64, letter_spacing: f64) -> f64 {
        super::shape::run_width(
            &[self],
            text,
            size,
            super::shape::RunOptions::spacing_only(letter_spacing),
        )
    }

    /// Lays a run of text out into left-to-right positioned glyphs.
    ///
    /// This is the render contract for text: the glyph id (with the
    /// missing-glyph `.notdef` fallback applied), its x offset from the run
    /// origin, its advance (`letter_spacing` included), and its byte range
    /// in `text` — all decided here, from the font, so renderers only
    /// *draw* what this returns and never re-decide fallbacks or advances.
    /// Shaping (kerning, ligatures) is applied via `super::shape`.
    pub fn positioned_glyphs(
        &self,
        text: &str,
        size: f64,
        letter_spacing: f64,
    ) -> Vec<PositionedGlyph> {
        super::shape::shape_run(
            &[self],
            text,
            size,
            super::shape::RunOptions::spacing_only(letter_spacing),
        )
    }

    /// Filled outline of one glyph at `size` pt, as move/line/cubic
    /// commands relative to the pen origin with **y growing downward**
    /// (the layout/tree convention). Font outlines are natively y-up, so
    /// the y axis is flipped here; a pixel backend then only translates by
    /// the baseline position. Returns `None` for an empty outline (spaces,
    /// `.notdef` in some faces) or a face without extractable outlines.
    pub fn glyph_path(&self, glyph_id: u32, size: f64) -> Option<Vec<PathCmd>> {
        let font = FontRef::from_index(&self.data, 0).ok()?;
        let outlines = font.outline_glyphs();
        let glyph = outlines.get(GlyphId::new(glyph_id))?;
        let mut pen = PathPen::default();
        let settings = DrawSettings::unhinted(Size::new(size as f32), LocationRef::default());
        glyph.draw(settings, &mut pen).ok()?;
        (!pen.cmds.is_empty()).then_some(pen.cmds)
    }
}

/// One glyph placed within a text run: what to draw and where, decided by
/// the font layer so renderers never re-measure. `x` and `advance` are pt
/// offsets from the run origin; `source` is the glyph's byte range in the
/// run text (renderers that map back to source, like the PDF backend's
/// ToUnicode, need it).
#[derive(Debug, Clone, PartialEq)]
pub struct PositionedGlyph {
    /// Face glyph id (0 = `.notdef` for chars the face cannot map).
    pub glyph_id: u32,
    /// Pen origin of the glyph from the run origin, in pt (cumulative
    /// advances; the shaper's positioning offset is `x_offset`, not folded
    /// in here so the PDF backend can advance by `advance` from one Point).
    pub x: f64,
    /// Advance width of the glyph, in pt (`letter_spacing` included).
    pub advance: f64,
    /// Shaper x/y positioning offset in pt (GPOS mark positioning), y in
    /// the layout's y-down convention. `0.0` on the per-char path and for
    /// kerning/ligatures (those ride advances and substitution).
    pub x_offset: f64,
    pub y_offset: f64,
    /// Byte range of the source cluster within the run text (a ligature
    /// glyph spans every char of its cluster — the ToUnicode contract).
    pub source: std::ops::Range<usize>,
    /// Index into the fallback chain of the face that drew this glyph (F3;
    /// 0 = the primary face). Single-face runs are always 0.
    pub face_index: usize,
}

impl std::fmt::Debug for FontFace {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FontFace")
            .field("id", &self.id)
            .field("bytes", &self.data.len())
            .finish()
    }
}
