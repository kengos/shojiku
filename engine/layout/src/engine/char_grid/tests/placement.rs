//! Unit tests for the placement notes at layout: indent offsets the
//! first physical line, the end-align placements override the item's
//! `textAlign`, and every note's cell count is clamped to the grid.

use super::super::cells::{align_cells, assign_cells};
use super::super::clamp::clamp_markup;
use super::{placed, run, span};
use shojiku_core::{KinsokuMode, LinePlacement, RubySegment, TextAlign};

/// Assigns one placed run and returns the cell positions.
fn positions(seg: RubySegment, cpl: usize) -> Vec<(usize, usize)> {
    let (cells, _) = assign_cells(&[seg], cpl, 99, KinsokuMode::None, 400, None);
    cells.iter().map(|c| (c.line, c.pos)).collect()
}

/// Assigns then aligns with the item `align`, returning cell positions.
fn aligned(seg: RubySegment, cpl: usize, align: TextAlign) -> Vec<(usize, usize)> {
    let (mut cells, _) = assign_cells(&[seg], cpl, 99, KinsokuMode::None, 400, None);
    align_cells(&mut cells, cpl, align);
    cells.iter().map(|c| (c.line, c.pos)).collect()
}

#[test]
fn indent_offsets_the_first_physical_line() {
    let out = positions(placed("題名", LinePlacement::Indent(2)), 5);
    assert_eq!(out, vec![(0, 2), (0, 3)]);
}

#[test]
fn an_indent_continuation_line_starts_at_the_line_head() {
    // The first physical line starts at the indent; the wrap resumes at 0.
    let out = positions(placed("あいうえ", LinePlacement::Indent(2)), 3);
    assert_eq!(out, vec![(0, 2), (1, 0), (1, 1), (1, 2)]);
}

#[test]
fn an_indent_past_the_line_is_clamped_to_the_last_cell() {
    let out = positions(placed("字", LinePlacement::Indent(9)), 3);
    assert_eq!(out, vec![(0, 2)]);
}

#[test]
fn flush_end_shifts_a_partial_line_to_the_end() {
    // 地付き: raise 0 pushes the run to the line's end.
    let out = aligned(
        placed("名", LinePlacement::FlushEnd { raise: 0 }),
        5,
        TextAlign::Left,
    );
    assert_eq!(out, vec![(0, 4)]);
}

#[test]
fn raise_leaves_cells_after_the_run() {
    let out = aligned(
        placed("名", LinePlacement::FlushEnd { raise: 2 }),
        5,
        TextAlign::Left,
    );
    assert_eq!(out, vec![(0, 2)]);
}

#[test]
fn center_centers_the_run() {
    let out = aligned(placed("名", LinePlacement::Center), 5, TextAlign::Left);
    assert_eq!(out, vec![(0, 2)]);
}

#[test]
fn a_placement_overrides_the_item_text_align() {
    // Item says right; the line's Center note wins.
    let out = aligned(placed("名", LinePlacement::Center), 5, TextAlign::Right);
    assert_eq!(out, vec![(0, 2)]);
}

#[test]
fn a_full_line_under_a_placement_never_moves() {
    let out = aligned(
        placed("あいう", LinePlacement::FlushEnd { raise: 0 }),
        3,
        TextAlign::Left,
    );
    assert_eq!(out, vec![(0, 0), (0, 1), (0, 2)]);
}

#[test]
fn item_text_align_shifts_a_span_block_row() {
    // No placement note: the ITEM's own textAlign moves a block row by
    // its free cells — the block's right edge is pos + scale − 1, so a
    // 2×2 block on a 6-cell line has free = 6 − 1 − 1 = 4 under right.
    let out = aligned(span("題", 2), 6, TextAlign::Right);
    assert_eq!(out, vec![(0, 4)]);
}

#[test]
fn a_placement_shifts_a_span_block_row() {
    // Center over a 2×2 block: the block's right edge is pos+scale-1 = 1,
    // so free = 6-1-1 = 4, shift 2.
    let seg = RubySegment {
        scale: Some(2),
        placement: Some(LinePlacement::Center),
        ..run("題", false)
    };
    let out = aligned(seg, 6, TextAlign::Left);
    assert_eq!(out, vec![(0, 2)]);
}

#[test]
fn clamp_reports_an_oversized_scale() {
    let mut segs = vec![span("題", 9)];
    let clamps = clamp_markup(&mut segs, 3, 4);
    assert_eq!(segs[0].scale, Some(3)); // min(cpl, lines)
    assert_eq!(clamps.len(), 1);
    assert_eq!(
        (clamps[0].note, clamps[0].value, clamps[0].max),
        ("大書き", 9, 3)
    );
}

#[test]
fn clamp_reports_an_oversized_indent() {
    let mut segs = vec![placed("字", LinePlacement::Indent(9))];
    let clamps = clamp_markup(&mut segs, 3, 99);
    assert_eq!(segs[0].placement, Some(LinePlacement::Indent(2)));
    assert_eq!((clamps[0].note, clamps[0].max), ("字下げ", 2));
}

#[test]
fn clamp_reports_an_oversized_raise() {
    let mut segs = vec![placed("字", LinePlacement::FlushEnd { raise: 9 })];
    let clamps = clamp_markup(&mut segs, 3, 99);
    assert_eq!(
        segs[0].placement,
        Some(LinePlacement::FlushEnd { raise: 2 })
    );
    assert_eq!(clamps[0].note, "地から上げ");
}

#[test]
fn clamp_leaves_center_and_plain_flush_end_untouched() {
    let mut segs = vec![
        placed("あ", LinePlacement::Center),
        placed("い", LinePlacement::FlushEnd { raise: 0 }),
    ];
    let clamps = clamp_markup(&mut segs, 3, 99);
    assert!(clamps.is_empty());
}
