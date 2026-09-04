//! Unit tests for the character-grid post-assignment end-shift.

use super::*;

#[test]
fn line_shift_distributes_the_free_cells() {
    // A 5-cell line filled to cell 1 has 3 free cells at its end.
    assert_eq!(line_shift(5, 1, TextAlign::Left), 0);
    assert_eq!(line_shift(5, 1, TextAlign::Right), 3);
    // Center floors, so an odd remainder favors the line's start.
    assert_eq!(line_shift(5, 1, TextAlign::Center), 1);
    assert_eq!(line_shift(5, 0, TextAlign::Center), 2);
}

#[test]
fn line_shift_of_a_full_line_is_zero() {
    for align in [TextAlign::Left, TextAlign::Center, TextAlign::Right] {
        assert_eq!(line_shift(3, 2, align), 0, "{align:?}");
    }
}

#[test]
fn line_shift_never_underflows_on_a_degenerate_grid() {
    // A one-cell line, and a position past the line (unreachable from
    // assignment, but the fn must not wrap into a huge shift).
    assert_eq!(line_shift(1, 0, TextAlign::Right), 0);
    assert_eq!(line_shift(3, 9, TextAlign::Right), 0);
    assert_eq!(line_shift(0, 0, TextAlign::Right), 0);
}

#[test]
fn placement_shift_positions_each_note_kind() {
    // Indent is positioned at assignment, so it never shifts here.
    assert_eq!(placement_shift(5, 0, LinePlacement::Indent(2)), 0);
    // `地付き` pushes the run to the end; `地からＮ字上げ` leaves N cells.
    assert_eq!(
        placement_shift(5, 0, LinePlacement::FlushEnd { raise: 0 }),
        4
    );
    assert_eq!(
        placement_shift(5, 0, LinePlacement::FlushEnd { raise: 2 }),
        2
    );
    // A raise past the free cells saturates to no shift.
    assert_eq!(
        placement_shift(5, 0, LinePlacement::FlushEnd { raise: 9 }),
        0
    );
    // Center floors an odd remainder toward the start.
    assert_eq!(placement_shift(5, 0, LinePlacement::Center), 2);
    assert_eq!(placement_shift(5, 1, LinePlacement::Center), 1);
}
