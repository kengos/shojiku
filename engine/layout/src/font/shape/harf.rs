//! HarfBuzz (harfrust) adapter: shapes one already-itemized segment (all
//! chars covered by a single face) into glyphs with pt-scaled advances and
//! positioning offsets. Shaping runs at units-per-em (harfrust has no size
//! notion), scaled to pt here by `size / units_per_em`. Returns `None` when
//! the face has no cached shaper data — the caller (`super::shape_run`)
//! then degrades to the per-char advance path.

use crate::font::FontFace;
use harfrust::{Direction, ShapeOptions, Tag, UnicodeBuffer};

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
    // Both `.ok()?`/`?` guards sit on always-run lines: on the success path
    // the font re-parses and the shaper data is present, so the segment is
    // shaped; a failure degrades to the per-char path in the caller.
    let font = harfrust::FontRef::from_index(&face.data, 0).ok()?;
    let shaper = face.shaper_data()?.shaper(&font).build();
    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);
    buffer.set_direction(Direction::LeftToRight);
    // Fills script/language from the text without overriding the direction
    // set above (only unset properties are guessed).
    buffer.guess_segment_properties();
    let features = ligature_features(ligatures);
    let glyphs = shaper.shape(buffer, ShapeOptions::new().features(&features));
    // harfrust positions are font units; scale to pt. y is font y-up, so
    // negate for the layout's y-down convention.
    let scale = size / face.units_per_em();
    let infos = glyphs.glyph_infos();
    let positions = glyphs.glyph_positions();
    Some(
        infos
            .iter()
            .zip(positions)
            .map(|(info, pos)| ShapedGlyph {
                glyph_id: info.glyph_id,
                x_advance: f64::from(pos.x_advance) * scale,
                x_offset: f64::from(pos.x_offset) * scale,
                // Negate in f64 space (font y-up -> layout y-down): negating
                // the i32 first would overflow on a hostile i32::MIN offset.
                y_offset: -f64::from(pos.y_offset) * scale,
                cluster: info.cluster as usize,
            })
            .collect(),
    )
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
    // Same always-run guard pattern as the horizontal path: a failure here
    // degrades to the per-char arrangement in the caller.
    let font = harfrust::FontRef::from_index(&face.data, 0).ok()?;
    let shaper = face.shaper_data()?.shaper(&font).build();
    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);
    buffer.set_direction(Direction::TopToBottom);
    buffer.guess_segment_properties();
    let glyphs = shaper.shape(buffer, ShapeOptions::new());
    let scale = size / face.units_per_em();
    let infos = glyphs.glyph_infos();
    let positions = glyphs.glyph_positions();
    Some(
        infos
            .iter()
            .zip(positions)
            .map(|(info, pos)| VerticalShapedGlyph {
                glyph_id: info.glyph_id,
                down_advance: down_pt(pos.y_advance, scale),
                x_offset: f64::from(pos.x_offset) * scale,
                down_offset: down_pt(pos.y_offset, scale),
                cluster: info.cluster as usize,
            })
            .collect(),
    )
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
fn ligature_features(enabled: bool) -> Vec<harfrust::Feature> {
    if enabled {
        Vec::new()
    } else {
        vec![
            harfrust::Feature::new(Tag::new(b"liga"), 0, ..),
            harfrust::Feature::new(Tag::new(b"clig"), 0, ..),
        ]
    }
}
