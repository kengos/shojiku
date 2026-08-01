//! large-writing block placement: a span segment's characters each fill an n×n
//! block of cells. Blocks fill along a block row and wrap at block
//! granularity; a block never straddles a sheet boundary. Pure over the
//! shared [`Sink`]/[`Cursor`] so hostile scales are unit-testable.

use shojiku_core::RubySegment;

use super::{next_sheet_start, CellChar, Cursor, Sink};

/// Places one span segment (`scale >= 2`, caller-clamped) as a run of
/// n×n blocks. Each block's `CellChar` records the block's top-left cell;
/// drawing reads `scale` to size the block. After the run the cursor
/// resumes on a fresh line below the last block row.
pub(super) fn place_span(
    sink: &mut Sink,
    cur: &mut Cursor,
    segment: &RubySegment,
    seg: usize,
    scale: usize,
    cpl: usize,
    lines_per_sheet: usize,
) {
    // A span always starts a fresh block row. At the head of a line we
    // stay there (an `Indent` may have offset `pos`); mid-line the block
    // opens the next line.
    let (mut row, mut col) = if cur.pos == 0 {
        (cur.line, 0)
    } else if cur.fresh_line {
        (cur.line, cur.pos)
    } else {
        (cur.line + 1, 0)
    };
    row = sheet_safe_row(row, scale, lines_per_sheet);
    for ch in segment.text.chars() {
        if ch == '\n' || ch == '\r' {
            continue;
        }
        if col + scale > cpl {
            row = sheet_safe_row(row + scale, scale, lines_per_sheet);
            col = 0;
        } else {
            row = sheet_safe_row(row, scale, lines_per_sheet);
        }
        sink.push(CellChar {
            line: row,
            pos: col,
            ch,
            // large-writing chars never combine — each fills its own n×n block.
            combined: None,
            hang: false,
            seg,
            scale,
            placement: segment.placement,
        });
        col += scale;
    }
    // Resume below the last block row.
    cur.line = row + scale;
    cur.pos = 0;
    cur.fresh_line = true;
}

/// Bumps a block row's top line to the next sheet when the block
/// (`scale` lines tall) would cross a sheet boundary, so a block is never
/// split across pages. A block exactly as tall as the sheet fits only at
/// a sheet start — mid-sheet it moves whole to the next sheet. A block
/// TALLER than the sheet (contract-violating input; the caller clamps
/// scale to the grid) stays at a sheet start and overflows downward
/// instead of looping. Saturating via [`next_sheet_start`].
fn sheet_safe_row(line: usize, scale: usize, lines_per_sheet: usize) -> usize {
    let per_sheet = lines_per_sheet.max(1);
    let offset = line % per_sheet;
    if offset != 0 && offset + scale > per_sheet {
        return next_sheet_start(line, per_sheet);
    }
    line
}
