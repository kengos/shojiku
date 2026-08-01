//! Unit tests for glyph mapping: the offset conventions at the
//! layout→krilla boundary.

use super::*;

/// Layout offsets are y-down pt; krilla consumes em-normalized offsets in
/// the HarfBuzz convention (positive = upward). A mark raised 5pt above
/// the baseline (layout `-5.0`) must reach krilla as `+0.5` em at 10pt.
#[test]
fn map_glyphs_flips_y_offset_to_the_harfbuzz_up_positive_convention() {
    let glyphs = [PositionedGlyph {
        glyph_id: 7,
        x: 0.0,
        advance: 10.0,
        x_offset: 2.0,
        y_offset: -5.0,
        source: 0..1,
        face_index: 0,
    }];
    let mapped = map_glyphs(&glyphs, 10.0);
    assert_eq!(mapped[0].x_advance, 1.0);
    assert_eq!(mapped[0].x_offset, 0.2);
    assert_eq!(mapped[0].y_offset, 0.5);
    assert_eq!(mapped[0].y_advance, 0.0);
}
