//! The post-assignment end-shift: `textAlign` (the item default) and the
//! per-line placement notes (`地付き` / `地からＮ字上げ` / `中央`), which
//! override the item's alignment for the lines they govern. `Indent` is
//! positional (assignment offsets `pos`), so it takes no shift here. Runs
//! after assignment, so a FULL line has no free cells and never moves.

use shojiku_core::{LinePlacement, TextAlign};

use super::CellChar;

/// Shifts each line's cells toward the line's END for `center` / `right`
/// (`textAlign`) or a placement note. Runs after assignment, so a FULL
/// line has no free cells and never moves — wrapped body text is
/// unaffected and only a partly filled line (the name field entry case, a
/// placement note's line) shifts. Assignment emits cells in line order,
/// so one pass over consecutive same-line runs covers every line.
pub(in crate::engine::char_grid) fn align_cells(
    cells: &mut [CellChar],
    chars_per_line: usize,
    align: TextAlign,
) {
    let mut start = 0;
    while start < cells.len() {
        let line = cells[start].line;
        let end = cells[start..]
            .iter()
            .position(|c| c.line != line)
            .map_or(cells.len(), |n| start + n);
        // A line's placement (uniform across its cells) overrides the item
        // alignment; `Indent` is already positioned, so it takes no shift.
        let placement = cells[start].placement;
        // Right edge of the widest cell/block on the line.
        let last = cells[start..end]
            .iter()
            .map(|c| c.pos + c.scale - 1)
            .max()
            .unwrap_or(0);
        let shift = match placement {
            Some(place) => placement_shift(chars_per_line, last, place),
            None => line_shift(chars_per_line, last, align),
        };
        for cell in &mut cells[start..end] {
            cell.pos += shift;
        }
        start = end;
    }
}

/// How far a line whose last occupied cell is `last_pos` shifts under
/// `align`. `center` floors, so an odd remainder favors the line's start.
pub(in crate::engine::char_grid) fn line_shift(
    chars_per_line: usize,
    last_pos: usize,
    align: TextAlign,
) -> usize {
    let free = free_cells(chars_per_line, last_pos);
    match align {
        TextAlign::Left => 0,
        TextAlign::Center => free / 2,
        TextAlign::Right => free,
    }
}

/// How far a line shifts under a placement note. `Indent` is positioned at
/// assignment, so it never shifts here; `FlushEnd { raise }` leaves
/// `raise` cells after the line; `Center` centers it.
pub(in crate::engine::char_grid) fn placement_shift(
    chars_per_line: usize,
    last_pos: usize,
    place: LinePlacement,
) -> usize {
    let free = free_cells(chars_per_line, last_pos);
    match place {
        LinePlacement::Indent(_) => 0,
        LinePlacement::FlushEnd { raise } => free.saturating_sub(raise),
        LinePlacement::Center => free / 2,
    }
}

/// Cells free after the line's last occupied cell.
fn free_cells(chars_per_line: usize, last_pos: usize) -> usize {
    chars_per_line.saturating_sub(1).saturating_sub(last_pos)
}

#[cfg(test)]
mod tests;
