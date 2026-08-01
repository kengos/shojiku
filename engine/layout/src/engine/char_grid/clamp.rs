//! Clamping a markup note's cell demand to what the grid can hold. A
//! large-writing scale, an indent, and a `地からＮ字上げ` raise all name a cell
//! count that untrusted params drive; each is clamped to the grid before
//! assignment and reported once via `char_grid_markup_clamped`. Pure over
//! the segments so the clamp is unit-testable.

use shojiku_core::{LinePlacement, RubySegment};

/// A clamp that happened, for the diagnostic: the note's label, the value
/// it asked for, and the maximum the grid allowed.
pub(super) struct MarkupClamp {
    pub note: &'static str,
    pub value: usize,
    pub max: usize,
}

/// Clamps every segment's `scale` and `placement` to the grid in place,
/// returning one [`MarkupClamp`] per note that overshot. A span's scale is
/// capped to `min(cpl, lines)` (a block is square and must fit both axes);
/// an indent / raise is capped to `cpl - 1` (leaving at least one cell).
pub(super) fn clamp_markup(
    segments: &mut [RubySegment],
    cpl: usize,
    lines: usize,
) -> Vec<MarkupClamp> {
    let mut clamps = Vec::new();
    let scale_max = cpl.min(lines);
    let cell_max = cpl.saturating_sub(1);
    for segment in segments.iter_mut() {
        if let Some(scale) = segment.scale {
            if scale > scale_max {
                clamps.push(MarkupClamp {
                    note: "大書き",
                    value: scale,
                    max: scale_max,
                });
                segment.scale = Some(scale_max);
            }
        }
        clamp_placement(&mut segment.placement, cell_max, &mut clamps);
    }
    clamps
}

/// Clamps one placement's cell count. `Center` and a plain `地付き`
/// (`raise: 0`) carry no count and never clamp.
fn clamp_placement(
    placement: &mut Option<LinePlacement>,
    cell_max: usize,
    clamps: &mut Vec<MarkupClamp>,
) {
    match placement {
        Some(LinePlacement::Indent(n)) if *n > cell_max => {
            clamps.push(MarkupClamp {
                note: "字下げ",
                value: *n,
                max: cell_max,
            });
            *n = cell_max;
        }
        Some(LinePlacement::FlushEnd { raise }) if *raise > cell_max => {
            clamps.push(MarkupClamp {
                note: "地から上げ",
                value: *raise,
                max: cell_max,
            });
            *raise = cell_max;
        }
        _ => {}
    }
}
