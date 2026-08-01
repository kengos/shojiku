//! Unit tests for char_grid's pure pieces: cell assignment (kinsoku,
//! sheet breaks), 縦中横 digit grouping, the `textAlign` shift, and grid
//! geometry math. (The vertical presentation tables are pinned in
//! `font/vertical/tests/forms.rs`, their canonical home.)

mod align;
mod combine;
mod placement;
mod span;

use super::cells::{assign_cells, CellChar};
use super::GridGeom;
use shojiku_core::{KinsokuMode, LinePlacement, RubySegment};

/// One unannotated run with no sheet break before it.
fn plain(text: &str) -> Vec<RubySegment> {
    vec![run(text, false)]
}

/// A 大書き span run: every char drawn as a `scale × scale` block.
fn span(text: &str, scale: usize) -> RubySegment {
    RubySegment {
        scale: Some(scale),
        ..run(text, false)
    }
}

/// A run carrying a per-line placement.
fn placed(text: &str, placement: LinePlacement) -> RubySegment {
    RubySegment {
        placement: Some(placement),
        ..run(text, false)
    }
}

/// One unannotated run, optionally preceded by a sheet break.
fn run(text: &str, sheet_break: bool) -> RubySegment {
    RubySegment {
        text: text.to_string(),
        ruby: None,
        sheet_break,
        scale: None,
        placement: None,
    }
}

fn at(cells: &[CellChar], i: usize) -> (usize, usize, char, bool) {
    let c = cells[i];
    (c.line, c.pos, c.ch, c.hang)
}

#[test]
fn fills_sequentially_and_wraps() {
    let (cells, overflow) = assign_cells(&plain("あいうえ"), 3, 99, KinsokuMode::None, 100, None);
    assert_eq!(overflow, 0);
    assert_eq!(at(&cells, 0), (0, 0, 'あ', false));
    assert_eq!(at(&cells, 2), (0, 2, 'う', false));
    assert_eq!(at(&cells, 3), (1, 0, 'え', false));
}

#[test]
fn newline_starts_a_line_and_cr_is_skipped() {
    let (cells, _) = assign_cells(
        &plain("あ\r\nい\n\nう"),
        5,
        99,
        KinsokuMode::None,
        100,
        None,
    );
    assert_eq!(at(&cells, 0), (0, 0, 'あ', false));
    assert_eq!(at(&cells, 1), (1, 0, 'い', false));
    // The blank line stays blank: う lands two lines down.
    assert_eq!(at(&cells, 2), (3, 0, 'う', false));
}

#[test]
fn school_punctuation_hangs_into_the_last_cell() {
    // 3 cells/line: く would end the line, 。 hangs back into cell 2.
    let (cells, _) = assign_cells(&plain("あいう。え"), 3, 99, KinsokuMode::School, 100, None);
    assert_eq!(at(&cells, 2), (0, 2, 'う', false));
    assert_eq!(at(&cells, 3), (0, 2, '。', true));
    assert_eq!(at(&cells, 4), (1, 0, 'え', false));
}

#[test]
fn kinsoku_none_puts_punctuation_at_line_head() {
    let (cells, _) = assign_cells(&plain("あいう。"), 3, 99, KinsokuMode::None, 100, None);
    assert_eq!(at(&cells, 3), (1, 0, '。', false));
}

#[test]
fn school_opener_never_ends_a_line() {
    // 「 at the last cell moves to the next line, leaving it empty.
    let (cells, _) = assign_cells(&plain("あい「う"), 3, 99, KinsokuMode::School, 100, None);
    assert_eq!(at(&cells, 1), (0, 1, 'い', false));
    assert_eq!(at(&cells, 2), (1, 0, '「', false));
    assert_eq!(at(&cells, 3), (1, 1, 'う', false));
}

#[test]
fn opener_rule_is_inert_on_one_cell_lines() {
    // chars_per_line == 1: every cell is both first and last; the opener
    // must not loop lines forever.
    let (cells, _) = assign_cells(&plain("「あ"), 1, 99, KinsokuMode::School, 100, None);
    assert_eq!(at(&cells, 0), (0, 0, '「', false));
    assert_eq!(at(&cells, 1), (1, 0, 'あ', false));
}

#[test]
fn closer_at_line_head_without_school_hang_only_once() {
    // Two hang chars in a row: the first hangs, the second starts the
    // next line normally (bounded degrade, not a loop).
    let (cells, _) = assign_cells(
        &plain("あいう。」え"),
        3,
        99,
        KinsokuMode::School,
        100,
        None,
    );
    assert_eq!(at(&cells, 3), (0, 2, '。', true));
    assert_eq!(at(&cells, 4), (1, 0, '」', false));
    assert_eq!(at(&cells, 5), (1, 1, 'え', false));
}

#[test]
fn cap_counts_overflow_instead_of_storing() {
    let (cells, overflow) = assign_cells(&plain("あいうえお"), 5, 99, KinsokuMode::None, 2, None);
    assert_eq!(cells.len(), 2);
    assert_eq!(overflow, 3);
}

#[test]
fn segment_indices_follow_the_source() {
    let segments = vec![
        RubySegment {
            text: "吾輩".into(),
            ruby: Some("わがはい".into()),
            sheet_break: false,
            scale: None,
            placement: None,
        },
        run("は", false),
    ];
    let (cells, _) = assign_cells(&segments, 10, 99, KinsokuMode::School, 100, None);
    assert_eq!(cells[0].seg, 0);
    assert_eq!(cells[1].seg, 0);
    assert_eq!(cells[2].seg, 1);
}

#[test]
fn sheet_break_jumps_to_the_next_sheet() {
    // 2 lines/sheet: あ sits on line 0, so the break sends い to line 2 —
    // sheet 1's first line — and leaves the rest of sheet 0 blank.
    let segments = vec![run("あ", false), run("い", true)];
    let (cells, _) = assign_cells(&segments, 3, 2, KinsokuMode::None, 100, None);
    assert_eq!(at(&cells, 0), (0, 0, 'あ', false));
    assert_eq!(at(&cells, 1), (2, 0, 'い', false));
}

#[test]
fn leading_and_consecutive_breaks_collapse() {
    // A break at a fresh sheet's first cell is a no-op, so a leading
    // break — and a second one with no content between — add no sheet.
    let segments = vec![run("", true), run("あ", true)];
    let (cells, _) = assign_cells(&segments, 3, 2, KinsokuMode::None, 100, None);
    assert_eq!(at(&cells, 0), (0, 0, 'あ', false));
}

#[test]
fn break_at_an_exhausted_sheet_adds_nothing() {
    // 1 line/sheet, 2 cells: あい fills sheet 0 and the cursor wraps to
    // line 1 pos 0, which is already sheet 1's first cell.
    let segments = vec![run("あい", false), run("う", true)];
    let (cells, _) = assign_cells(&segments, 2, 1, KinsokuMode::None, 100, None);
    assert_eq!(at(&cells, 2), (1, 0, 'う', false));
}

#[test]
fn hostile_breaks_stay_bounded_by_the_cell_cap() {
    // A params-driven bomb: every run breaks a sheet. Storage stops at
    // the cap and the line index stays finite (no wrap, no hang).
    let segments: Vec<_> = (0..10_000).map(|_| run("あ", true)).collect();
    let (cells, overflow) = assign_cells(&segments, 2, 2, KinsokuMode::None, 64, None);
    assert_eq!(cells.len(), 64);
    assert_eq!(overflow, 10_000 - 64);
    assert_eq!(cells[63].line, 63 * 2);
}

#[test]
fn a_degenerate_sheet_height_never_divides_by_zero() {
    // The caller clamps `lines` to >= 1; the pure fn must not trust it.
    let segments = vec![run("あ", false), run("い", true)];
    let (cells, _) = assign_cells(&segments, 3, 0, KinsokuMode::None, 100, None);
    assert_eq!(at(&cells, 1), (1, 0, 'い', false));
}

fn geom(vertical: bool) -> GridGeom {
    GridGeom {
        cell: 10.0,
        char_gap: 1.0,
        line_gap: 4.0,
        cpl: 3,
        lines: 2,
        vertical,
        ruby_size: 4.0,
    }
}

#[test]
fn horizontal_geometry_maps_lines_down() {
    let g = geom(false);
    assert_eq!(g.grid_w(), 3.0 * 10.0 + 2.0 * 1.0);
    assert_eq!(g.sheet_h(), 2.0 * 10.0 + 4.0);
    assert_eq!(g.cell_origin(0, 0), (0.0, 0.0));
    assert_eq!(g.cell_origin(1, 2), (22.0, 14.0));
}

#[test]
fn vertical_geometry_maps_lines_right_to_left() {
    let g = geom(true);
    // 2 columns + 1 line gap wide; 3 cells + 2 char gaps tall.
    assert_eq!(g.grid_w(), 2.0 * 10.0 + 4.0);
    assert_eq!(g.sheet_h(), 3.0 * 10.0 + 2.0 * 1.0);
    // Line 0 is the RIGHTMOST column.
    assert_eq!(g.cell_origin(0, 0), (14.0, 0.0));
    assert_eq!(g.cell_origin(1, 2), (0.0, 22.0));
}
