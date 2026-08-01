//! Unit tests for the `textAlign` end-alignment shift: the pure per-line
//! math, and the pass over an assigned grid.

use super::super::cells::{align_cells, assign_cells, CellChar};
use super::{plain, run};
use shojiku_core::{KinsokuMode, TextAlign};

/// The cell positions of every placed char, in assignment order.
fn positions(cells: &[CellChar]) -> Vec<(usize, usize)> {
    cells.iter().map(|c| (c.line, c.pos)).collect()
}

/// `text` assigned into a `cpl`-wide grid, then aligned.
fn aligned(text: &str, cpl: usize, align: TextAlign) -> Vec<CellChar> {
    let (mut cells, _) = assign_cells(&plain(text), cpl, 99, KinsokuMode::School, 100, None);
    align_cells(&mut cells, cpl, align);
    cells
}

#[test]
fn right_fills_a_single_entry_line_toward_its_end() {
    // The driving case: a name in a 名前欄 sits at the line's END.
    let cells = aligned("山田", 5, TextAlign::Right);
    assert_eq!(positions(&cells), vec![(0, 3), (0, 4)]);
}

#[test]
fn center_floors_toward_the_line_start() {
    let cells = aligned("山田", 5, TextAlign::Center);
    assert_eq!(positions(&cells), vec![(0, 1), (0, 2)]);
}

#[test]
fn left_leaves_the_assignment_untouched() {
    let cells = aligned("山田", 5, TextAlign::Left);
    assert_eq!(positions(&cells), vec![(0, 0), (0, 1)]);
}

#[test]
fn a_full_line_never_moves() {
    // Wrapped body text keeps its assignment: only the short LAST line
    // has free cells to shift into.
    let cells = aligned("あいうえお", 3, TextAlign::Right);
    assert_eq!(
        positions(&cells),
        vec![(0, 0), (0, 1), (0, 2), (1, 1), (1, 2)]
    );
}

#[test]
fn each_line_shifts_by_its_own_free_cells() {
    let cells = aligned("あ\nいい\nううう", 3, TextAlign::Right);
    assert_eq!(
        positions(&cells),
        vec![(0, 2), (1, 1), (1, 2), (2, 0), (2, 1), (2, 2)]
    );
}

#[test]
fn a_hung_cell_keeps_its_line_full() {
    // ぶら下げ puts 。 in the line's LAST cell, which is exactly why the
    // line has no free cells left to shift into.
    let cells = aligned("あいう。え", 3, TextAlign::Right);
    assert_eq!(positions(&cells)[3], (0, 2));
    assert!(cells[3].hang);
    // The short second line still shifts.
    assert_eq!(positions(&cells)[4], (1, 2));
}

#[test]
fn a_kinsoku_gap_fills_under_right_align() {
    // 行末禁則 pushes 「 off line 0, leaving its last cell empty; that
    // makes line 0 short, so right-align de-rags it like any other short
    // line. The prohibition survives: line 0 now ends on い, and 「 still
    // sits at a line START.
    let cells = aligned("あい「う", 3, TextAlign::Right);
    assert_eq!(positions(&cells), vec![(0, 1), (0, 2), (1, 1), (1, 2)]);
    assert_eq!(cells[2].ch, '「');
}

#[test]
fn a_hostile_comma_run_aligns_only_its_short_last_line() {
    // 、×N: every full line ends in a ぶら下げ cell (the run's commas
    // hang one per boundary), so under right-align nothing but the
    // final partial line may move — and no shift may push a cell past
    // the line end. 21 commas = 5 full 3+hang lines + ONE short line.
    let cells = aligned(&"、".repeat(21), 3, TextAlign::Right);
    for cell in &cells {
        assert!(cell.pos < 3, "cell pushed past the line end: {cell:?}");
    }
    let last = *cells.last().unwrap();
    for cell in cells.iter().filter(|c| c.line < last.line) {
        // Full lines keep their assignment: hang cells at pos 2 share
        // the last cell; regular cells fill 0..=2 from the start.
        assert!(!cell.hang || cell.pos == 2);
    }
    // The final line holds one comma and shifts to the line's end.
    assert!(!last.hang);
    assert_eq!((last.line, last.pos), (5, 2));
}

#[test]
fn empty_content_aligns_without_panicking() {
    let mut cells = Vec::new();
    align_cells(&mut cells, 5, TextAlign::Right);
    assert!(cells.is_empty());
}

#[test]
fn alignment_is_line_relative_across_sheets() {
    // Lines carry their sheet's index; the shift keys off the line's own
    // fill, so a break's short line shifts like any other.
    let segments = vec![run("あ", false), run("い", true)];
    let (mut cells, _) = assign_cells(&segments, 3, 2, KinsokuMode::None, 100, None);
    align_cells(&mut cells, 3, TextAlign::Right);
    assert_eq!(positions(&cells), vec![(0, 2), (2, 2)]);
}
