//! Unit tests for the vertical 約物半角 pass: class arms, the half-em
//! target net of letter spacing, the column-head trim, and the hostile
//! guards (rotated cells, degenerate source ranges) — all over synthetic
//! arrangements, no font needed.

use super::apply_vertical_trim;
use crate::font::VGlyph;
use shojiku_core::TextSpacingTrim::{Normal, TrimStart};

/// One synthetic 1em-advance cell per char of `text`, stacked.
fn cells(text: &str, size: f64) -> Vec<VGlyph> {
    let mut out = Vec::new();
    let mut down = 0.0;
    for (i, c) in text.char_indices() {
        out.push(VGlyph {
            glyph_id: 1,
            face_index: 0,
            down,
            advance: size,
            rotated: false,
            dx: 5.0,
            dy: 8.0,
            source: i..i + c.len_utf8(),
            scale: 1.0,
        });
        down += size;
    }
    out
}

#[test]
fn close_before_punct_trims_its_trailing_space_and_restacks() {
    // 、 (Close) followed by 「 (Open): both trim to half-em, and the
    // opening bracket also slides UP so its ink hugs the comma.
    let mut g = cells("、「あ", 10.0);
    let dy0 = g[1].dy;
    apply_vertical_trim(&mut g, "、「あ", Normal, false, 10.0, 0.0);
    assert_eq!(g[0].advance, 5.0);
    assert_eq!(g[1].advance, 5.0);
    assert_eq!(g[1].dy, dy0 - 5.0); // ink pulled up by the removed space
    assert_eq!(g[2].advance, 10.0); // the ideograph is untouched
    assert_eq!((g[0].down, g[1].down, g[2].down), (0.0, 5.0, 10.0));
}

#[test]
fn a_column_end_close_is_never_trimmed() {
    // The Close arm requires a fullwidth punctuation AFTER it — the
    // property the hanging-punctuation measure leans on.
    let mut g = cells("あ、", 10.0);
    apply_vertical_trim(&mut g, "あ、", Normal, false, 10.0, 0.0);
    assert_eq!(g[1].advance, 10.0);
}

#[test]
fn column_head_bracket_trims_only_under_trim_start() {
    let mut normal = cells("「あ", 10.0);
    apply_vertical_trim(&mut normal, "「あ", Normal, true, 10.0, 0.0);
    assert_eq!(normal[0].advance, 10.0); // `normal` keeps the head space

    let mut head = cells("「あ", 10.0);
    let dy0 = head[0].dy;
    apply_vertical_trim(&mut head, "「あ", TrimStart, true, 10.0, 0.0);
    assert_eq!(head[0].advance, 5.0);
    assert_eq!(head[0].dy, dy0 - 5.0);
    // Mid-column (not a column head) the same bracket keeps its space.
    let mut mid = cells("「あ", 10.0);
    apply_vertical_trim(&mut mid, "「あ", TrimStart, false, 10.0, 0.0);
    assert_eq!(mid[0].advance, 10.0);
}

#[test]
fn letter_spacing_is_excluded_from_the_half_em_target() {
    let mut g = cells("、。", 10.0);
    for c in g.iter_mut() {
        c.advance += 2.0; // spacing rides every cell
    }
    apply_vertical_trim(&mut g, "、。", Normal, false, 10.0, 2.0);
    // delta = (12 − 2 − 5) = 5 → the spaced half-em cell keeps its spacing.
    assert_eq!(g[0].advance, 7.0);
}

#[test]
fn rotated_cells_and_degenerate_sources_never_trim() {
    let mut g = cells("、。", 10.0);
    g[0].rotated = true; // a rotated cell is never fullwidth punctuation
    g[1].source = 99..99; // hostile range classifies as Other
    let before: Vec<f64> = g.iter().map(|c| c.advance).collect();
    apply_vertical_trim(&mut g, "、。", Normal, true, 10.0, 0.0);
    let after: Vec<f64> = g.iter().map(|c| c.advance).collect();
    assert_eq!(before, after);
}

#[test]
fn empty_arrangement_is_a_no_op() {
    let mut g: Vec<VGlyph> = Vec::new();
    apply_vertical_trim(&mut g, "", Normal, true, 10.0, 0.0);
    assert!(g.is_empty());
}
