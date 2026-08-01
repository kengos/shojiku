//! Unit tests for 大書き block assignment and the block-rect geometry:
//! blocks fill along a row, wrap at block granularity, never straddle a
//! sheet, and resume below; `block_rect` maps a block to its page rect.

use super::super::cells::assign_cells;
use super::{geom, run, span};
use shojiku_core::{KinsokuMode, LinePlacement, RubySegment};

/// (line, pos, scale) of each placed block.
fn blocks(text: &str, scale: usize, cpl: usize, lines: usize) -> Vec<(usize, usize, usize)> {
    let (cells, _) = assign_cells(
        &[span(text, scale)],
        cpl,
        lines,
        KinsokuMode::None,
        400,
        None,
    );
    cells.iter().map(|c| (c.line, c.pos, c.scale)).collect()
}

#[test]
fn blocks_fill_along_the_row_by_scale() {
    // Two 2×2 blocks side by side: col advances by the scale.
    assert_eq!(blocks("会話", 2, 5, 99), vec![(0, 0, 2), (0, 2, 2)]);
}

#[test]
fn a_block_that_does_not_fit_wraps_to_the_next_block_row() {
    // cpl 3 fits one 2-wide block per row; the row pitch is the scale.
    assert_eq!(
        blocks("あいう", 2, 3, 99),
        vec![(0, 0, 2), (2, 0, 2), (4, 0, 2)]
    );
}

#[test]
fn an_indented_span_starts_its_block_row_at_the_indent() {
    // Indent offsets a fresh line's `pos`; a span there begins its block
    // row at that offset rather than the line head.
    let seg = RubySegment {
        scale: Some(2),
        placement: Some(LinePlacement::Indent(2)),
        ..run("大", false)
    };
    let (cells, _) = assign_cells(&[seg], 6, 99, KinsokuMode::None, 400, None);
    assert_eq!((cells[0].line, cells[0].pos, cells[0].scale), (0, 2, 2));
}

#[test]
fn a_span_at_a_nonempty_line_starts_a_fresh_block_row() {
    let segments = vec![run("前", false), span("題", 2)];
    let (cells, _) = assign_cells(&segments, 5, 99, KinsokuMode::None, 400, None);
    // 前 on line 0; the block opens line 1.
    assert_eq!((cells[0].line, cells[0].pos), (0, 0));
    assert_eq!((cells[1].line, cells[1].pos, cells[1].scale), (1, 0, 2));
}

#[test]
fn content_after_a_span_resumes_below_the_block_row() {
    let segments = vec![span("題", 2), run("本文", false)];
    let (cells, _) = assign_cells(&segments, 5, 99, KinsokuMode::None, 400, None);
    // The block tops line 0 (occupies 0,1); 本 resumes on line 2.
    assert_eq!(cells[0].line, 0);
    assert_eq!((cells[1].line, cells[1].pos, cells[1].ch), (2, 0, '本'));
}

#[test]
fn a_block_never_straddles_a_sheet_boundary() {
    // per_sheet 3, scale 2: a block that would top line 2 (spanning 2,3)
    // is pushed to the next sheet's first line.
    let segments = vec![run("あ\nい\n", false), span("大", 2)];
    let (cells, _) = assign_cells(&segments, 3, 3, KinsokuMode::None, 400, None);
    let block = cells.iter().find(|c| c.ch == '大').unwrap();
    assert_eq!(block.line, 3, "block pushed off the straddled sheet");
}

#[test]
fn a_sheet_tall_block_fits_only_at_a_sheet_start() {
    // scale == lines: mid-sheet the block moves WHOLE to the next sheet
    // (lines 3..6), never straddling; at a sheet start it stays.
    let segments = vec![run("あ\n", false), span("大", 3)];
    let (cells, _) = assign_cells(&segments, 3, 3, KinsokuMode::None, 400, None);
    let block = cells.iter().find(|c| c.ch == '大').unwrap();
    assert_eq!(block.line, 3, "sheet-tall block pushed to the sheet start");

    let (cells, _) = assign_cells(&[span("大", 3)], 3, 3, KinsokuMode::None, 400, None);
    assert_eq!(cells[0].line, 0, "already at a sheet start: stays");
}

#[test]
fn a_hangs_back_char_after_a_span_opens_a_fresh_line() {
    // A span resumes content on a fresh line at pos 0, where ぶら下げ never
    // triggers (it fires only past the line end), so a trailing 。 sits in
    // its own cell rather than hanging into the block row.
    let segments = vec![span("大", 2), run("。", false)];
    let (cells, _) = assign_cells(&segments, 4, 99, KinsokuMode::School, 400, None);
    let dot = cells.iter().find(|c| c.ch == '。').unwrap();
    assert_eq!((dot.line, dot.pos, dot.hang), (2, 0, false));
}

#[test]
fn overflow_past_the_cap_counts_span_blocks() {
    // A cap of 1 stores one block and counts the rest.
    let (cells, overflow) = assign_cells(&[span("会話", 2)], 5, 99, KinsokuMode::None, 1, None);
    assert_eq!(cells.len(), 1);
    assert_eq!(overflow, 1);
}

#[test]
fn a_carriage_return_and_newline_inside_a_span_are_skipped() {
    // Spans are single runs, but a hostile value could smuggle controls;
    // they must not create phantom blocks.
    let out = blocks("会\r\n話", 2, 5, 99);
    assert_eq!(out, vec![(0, 0, 2), (0, 2, 2)]);
}

#[test]
fn block_rect_horizontal_covers_the_scale_square() {
    let g = geom(false); // cell 10, char_gap 1, line_gap 4
                         // 2×2 block at (0,0): 2 cells + 1 char_gap along x, + 1 line_gap down.
    assert_eq!(g.block_rect(0, 0, 2), (0.0, 0.0, 21.0, 24.0));
    // scale 1 reduces to a single cell.
    assert_eq!(g.block_rect(1, 2, 1), (22.0, 14.0, 10.0, 10.0));
}

#[test]
fn block_rect_vertical_anchors_the_min_x_at_the_last_line() {
    let g = geom(true); // 3 cells tall, 2 lines (cols) — a full 2-line grid
                        // A 2×2 block at top line 0: its leftmost line is line 1, so min-x is
                        // cell_origin(1,0).x = 0; the block is 24 wide (across) × 21 tall.
    assert_eq!(g.block_rect(0, 0, 2), (0.0, 0.0, 24.0, 21.0));
}
