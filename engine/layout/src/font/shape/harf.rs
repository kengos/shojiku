//! HarfBuzz (harfrust) adapter: shapes one already-itemized segment (all
//! chars covered by a single face) into glyphs with pt-scaled advances and
//! positioning offsets. Shaping runs at units-per-em (harfrust has no size
//! notion), scaled to pt here by `size / units_per_em`. Returns `None` when
//! the face has no shaping font, or when harfrust marks the shaped buffer
//! as failed (it hit a length, operation or nesting limit) — the caller
//! (`super::shape_run`) then degrades to the per-char advance path.

use crate::font::FontFace;
use harfrust::{
    Buffer, Direction, Feature, GlyphInfo, GlyphPosition, ShapeOptions, ShaperFont, Tag,
};

/// One shaped glyph, positions already in pt. `cluster` is the byte offset
/// of the source char **within the segment text** (harfrust monotone LTR
/// clusters); `super::shape_run` offsets it by the segment start.
pub(crate) struct ShapedGlyph {
    pub glyph_id: u32,
    pub x_advance: f64,
    pub x_offset: f64,
    pub y_offset: f64,
    pub cluster: usize,
}

/// Shapes `text` with `face` at `size` pt. `ligatures = false` disables the
/// `liga`/`clig` features (CSS: non-zero `letter-spacing` suppresses
/// optional ligatures). `None` = no shaper (degrade per-char).
pub(crate) fn shape_segment(
    face: &FontFace,
    text: &str,
    size: f64,
    ligatures: bool,
) -> Option<Vec<ShapedGlyph>> {
    let features = ligature_features(ligatures);
    let buffer = shape_buffer(face, text, Direction::LeftToRight, &features)?;
    // harfrust positions are font units; scale to pt. y is font y-up, so
    // negate for the layout's y-down convention.
    let scale = size / face.units_per_em();
    shaped_glyphs(&buffer, |info, pos| ShapedGlyph {
        glyph_id: info.glyph_id,
        x_advance: f64::from(pos.x_advance) * scale,
        x_offset: f64::from(pos.x_offset) * scale,
        // Negate in f64 space (font y-up -> layout y-down): negating
        // the i32 first would overflow on a hostile i32::MIN offset.
        y_offset: -f64::from(pos.y_offset) * scale,
        cluster: info.cluster as usize,
    })
}

/// One glyph shaped for a vertical (top-to-bottom) run, positions already
/// normalized to pt in the layout's conventions: `down_advance` grows down
/// the column (harfrust reports vertical advances as negative y), `x_offset`
/// is the pen-relative horizontal shift of the glyph's HORIZONTAL draw
/// origin from the column's central axis (harfbuzz folds the vertical-origin
/// centering in), and `down_offset` the shift from the cell top to the
/// glyph's horizontal baseline (y-down).
pub(crate) struct VerticalShapedGlyph {
    pub glyph_id: u32,
    pub down_advance: f64,
    pub x_offset: f64,
    pub down_offset: f64,
    pub cluster: usize,
}

/// Shapes `text` top-to-bottom with `face` at `size` pt — real vertical
/// shaping: harfrust enables the font's GSUB `vert` feature for a vertical
/// buffer and advances by `vmtx`/vertical-origin data (falling back to its
/// own Unicode presentation-form substitution for a `vert`-less font).
/// `None` = no shaper (the caller degrades to the per-char table path).
pub(crate) fn shape_segment_vertical(
    face: &FontFace,
    text: &str,
    size: f64,
) -> Option<Vec<VerticalShapedGlyph>> {
    let buffer = shape_buffer(face, text, Direction::TopToBottom, &[])?;
    let scale = size / face.units_per_em();
    shaped_glyphs(&buffer, |info, pos| VerticalShapedGlyph {
        glyph_id: info.glyph_id,
        down_advance: down_pt(pos.y_advance, scale),
        x_offset: f64::from(pos.x_offset) * scale,
        down_offset: down_pt(pos.y_offset, scale),
        cluster: info.cluster as usize,
    })
}

/// Shapes `text` with `face` in `direction` into a fresh buffer. `None`
/// when the face has no shaping font. Both guards sit on always-run lines:
/// on the success path the font is present and shaping succeeds.
pub(super) fn shape_buffer(
    face: &FontFace,
    text: &str,
    direction: Direction,
    features: &[Feature],
) -> Option<Buffer> {
    let shaper = ShaperFont::new(face.shaper_font()?);
    let mut buffer = Buffer::new();
    buffer.push_str(text);
    buffer.set_direction(direction);
    // Fills script/language from the text without overriding the direction
    // set above (only unset properties are guessed).
    buffer.guess_segment_properties();
    // harfrust errs only on API misuse (a fresh buffer with its direction
    // set and no plan passed cannot hit one).
    harfrust::shape(&shaper, &mut buffer, ShapeOptions::new().features(features)).ok()?;
    Some(buffer)
}

/// Maps a shaped buffer's glyphs through `glyph`, or `None` when harfrust
/// marked the buffer as failed: it needed more room, operations or nesting
/// than its limits allow, which a hostile font can provoke. harfrust
/// reports that on the buffer rather than as an error, and what it left in
/// the buffer is then not a complete shaping of the run, so the caller
/// degrades to the per-char path instead of drawing it. Not every limit
/// marks the buffer: some table walks (AAT `morx`/`kern`/`kerx`, a
/// contextual lookup that finds the operation budget spent) just stop
/// early, and that output is drawn as shaped.
pub(super) fn shaped_glyphs<T>(
    buffer: &Buffer,
    glyph: impl Fn(&GlyphInfo, &GlyphPosition) -> T,
) -> Option<Vec<T>> {
    let glyphs = buffer.glyph_infos().iter().zip(buffer.glyph_positions());
    buffer
        .allocation_successful()
        .then(|| glyphs.map(|(info, pos)| glyph(info, pos)).collect())
}

/// A font y-up value flipped to the layout's y-down pt space. Vertical
/// advances/offsets are negative going down (font y-up); negating in f64
/// space keeps a hostile `i32::MIN` from overflowing — the same rule as
/// the horizontal `y_offset` flip above. Pure so the boundary values are
/// unit-testable without a hostile font.
pub(super) fn down_pt(v: i32, scale: f64) -> f64 {
    -f64::from(v) * scale
}

/// The shaping features slice for the ligature state: empty when
/// ligatures are enabled (harfrust applies `liga`/`clig` by default), or
/// `liga`/`clig` forced off when they are suppressed (non-zero spacing).
fn ligature_features(enabled: bool) -> Vec<Feature> {
    if enabled {
        Vec::new()
    } else {
        vec![
            Feature::new(Tag::new(b"liga"), 0, ..),
            Feature::new(Tag::new(b"clig"), 0, ..),
        ]
    }
}
