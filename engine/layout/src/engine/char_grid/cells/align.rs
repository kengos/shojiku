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
mod tests {
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
}
