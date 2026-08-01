//! Unit tests for the pure cut-mark geometry: cut positions, the
//! per-side room clamp, and the degenerate grids that must draw nothing.

use super::*;

/// A 2×2 grid of 100pt cells with a 20pt gap, 25pt of room all round.
fn grid_2x2() -> MarkGeometry {
    MarkGeometry {
        left: 25.0,
        top: 0.0,
        slot: (100.0, 100.0),
        gap: (20.0, 20.0),
        counts: (2, 2),
        room: [25.0; 4],
    }
}

fn xs(lines: &[LineShape]) -> Vec<f64> {
    lines.iter().map(|l| l.x1).collect()
}

#[test]
fn positions_are_the_outer_edges_and_the_gap_centres() {
    // Two 100pt slots with a 20pt gap: edges at 0 and 220, the interior
    // cut through the middle of the gap at 110.
    assert_eq!(
        MarkGeometry::positions(0.0, 100.0, 20.0, 2),
        vec![0.0, 110.0, 220.0]
    );
}

#[test]
fn a_zero_gap_puts_the_interior_cut_on_the_shared_edge() {
    assert_eq!(
        MarkGeometry::positions(0.0, 50.0, 0.0, 3),
        vec![0.0, 50.0, 100.0, 150.0]
    );
}

#[test]
fn every_cut_position_gets_a_tick_at_both_ends() {
    let (lines, clipped) = cut_marks(&grid_2x2());
    // 3 vertical cuts × 2 ends + 3 horizontal cuts × 2 ends.
    assert_eq!(lines.len(), 12);
    assert!(clipped.0.is_empty());
    // The vertical cuts sit at the grid's left edge, the gap centre, and
    // the right edge; the top ticks reach UP out of the grid.
    let top: Vec<&LineShape> = lines.iter().filter(|l| l.y2 < l.y1).collect();
    assert_eq!(
        xs(&top.iter().map(|l| (*l).clone()).collect::<Vec<_>>()),
        vec![25.0, 135.0, 245.0]
    );
    assert!(top.iter().all(|l| l.y1 == 0.0 && l.y2 == -CUT_MARK_LEN));
}

#[test]
fn ticks_reach_outward_on_all_four_sides() {
    let (lines, _) = cut_marks(&grid_2x2());
    // Left ticks start at the grid's left edge and reach further left.
    assert!(lines
        .iter()
        .any(|l| l.x1 == 25.0 && l.x2 == 25.0 - CUT_MARK_LEN && l.y1 == l.y2));
    // Right ticks start at the grid's right edge (25 + 100 + 20 + 100).
    assert!(lines
        .iter()
        .any(|l| l.x1 == 245.0 && l.x2 == 245.0 + CUT_MARK_LEN && l.y1 == l.y2));
    // Bottom ticks hang below the last row (0 + 100 + 20 + 100).
    assert!(lines
        .iter()
        .any(|l| l.y1 == 220.0 && l.y2 == 220.0 + CUT_MARK_LEN && l.x1 == l.x2));
}

#[test]
fn a_side_with_less_room_than_the_tick_draws_a_shorter_one() {
    let mut geometry = grid_2x2();
    geometry.room[3] = 2.0;
    let (lines, clipped) = cut_marks(&geometry);
    assert!(clipped.0.is_empty());
    assert!(lines.iter().any(|l| l.x1 == 25.0 && l.x2 == 23.0));
}

#[test]
fn a_side_with_no_room_is_skipped_and_reported() {
    let mut geometry = grid_2x2();
    geometry.room[0] = 0.0;
    geometry.room[1] = -3.0;
    let (lines, clipped) = cut_marks(&geometry);
    assert_eq!(clipped.0, vec!["top", "right"]);
    assert_eq!(clipped.sides(), "top, right");
    // Only the bottom (3) and left (3) ticks survive.
    assert_eq!(lines.len(), 6);
}

#[test]
fn the_reported_sides_follow_the_page_margin_order() {
    let geometry = MarkGeometry {
        room: [0.0; 4],
        ..grid_2x2()
    };
    let (lines, clipped) = cut_marks(&geometry);
    assert!(lines.is_empty());
    // Found as top, bottom, left, right; reported in margin order.
    assert_eq!(clipped.0, vec!["top", "bottom", "left", "right"]);
    assert_eq!(clipped.sides(), "top, right, bottom, left");
}

#[test]
fn a_non_finite_room_is_treated_as_no_room() {
    let mut geometry = grid_2x2();
    geometry.room[2] = f64::NAN;
    let (_, clipped) = cut_marks(&geometry);
    assert_eq!(clipped.0, vec!["bottom"]);
}

#[test]
fn a_degenerate_grid_draws_nothing() {
    for (slot, counts) in [
        ((0.0, 100.0), (2, 2)),
        ((100.0, f64::NAN), (2, 2)),
        ((100.0, 100.0), (0, 2)),
        ((100.0, 100.0), (2, 0)),
    ] {
        let geometry = MarkGeometry {
            slot,
            counts,
            ..grid_2x2()
        };
        let (lines, clipped) = cut_marks(&geometry);
        assert!(lines.is_empty(), "slot {slot:?} counts {counts:?}");
        assert!(clipped.0.is_empty());
    }
}

#[test]
fn a_single_cell_grid_marks_its_four_edges() {
    let geometry = MarkGeometry {
        counts: (1, 1),
        ..grid_2x2()
    };
    let (lines, _) = cut_marks(&geometry);
    // One cut per axis edge: 2 positions × 2 ends × 2 axes.
    assert_eq!(lines.len(), 8);
}

#[test]
fn the_tick_count_is_bounded_by_the_clamped_grid() {
    // The per-page cell cap bounds both axes, so a hostile grid can never
    // drive an unbounded number of segments.
    let geometry = MarkGeometry {
        slot: (5.0, 5.0),
        gap: (0.0, 0.0),
        counts: (64, 1),
        ..grid_2x2()
    };
    let (lines, _) = cut_marks(&geometry);
    assert_eq!(lines.len(), 2 * (64 + 1) + 2 * (1 + 1));
}
