//! Tests for the CSS freeze loop (`resolve_flex_lengths`): growing by
//! weight, shrinking in proportion to the bases, and freezing at a
//! violated bound — each probed at the admitted extremes too.

use super::super::{FlexItem, resolve_flex_lengths};

fn item(basis: f64, weight: f64) -> FlexItem {
    FlexItem {
        basis,
        weight,
        min: None,
        max: None,
    }
}

#[test]
fn flex_lengths_grow_from_the_basis_by_weight() {
    // Two children starting at 20 each in a 100pt row: 60 leftover splits
    // 1:3, so 20+15 and 20+45.
    let sizes = resolve_flex_lengths(100.0, &[item(20.0, 1.0), item(20.0, 3.0)]);
    assert_eq!(sizes, vec![35.0, 65.0]);
}

#[test]
fn flex_lengths_with_a_zero_basis_split_the_whole_row() {
    // The `flex: 1` idiom: basis 0 means flexGrow divides everything.
    let sizes = resolve_flex_lengths(90.0, &[item(0.0, 1.0), item(0.0, 2.0)]);
    assert_eq!(sizes, vec![30.0, 60.0]);
}

#[test]
fn flex_lengths_freeze_a_clamped_child_and_redistribute_to_the_rest() {
    // The assertion that distinguishes a real freeze loop from a single
    // clamp-and-stop: the capped child's unused space must reach its
    // sibling, so the row still fills.
    let capped = FlexItem {
        basis: 0.0,
        weight: 1.0,
        min: None,
        max: Some(20.0),
    };
    let sizes = resolve_flex_lengths(100.0, &[capped, item(0.0, 1.0)]);
    assert_eq!(sizes[0], 20.0);
    assert_eq!(sizes[1], 80.0);
}

#[test]
fn flex_lengths_terminate_with_a_min_and_a_max_clamping_at_once() {
    let floored = FlexItem {
        basis: 0.0,
        weight: 1.0,
        min: Some(70.0),
        max: None,
    };
    let capped = FlexItem {
        basis: 0.0,
        weight: 1.0,
        min: None,
        max: Some(10.0),
    };
    let sizes = resolve_flex_lengths(100.0, &[floored, capped]);
    assert_eq!(sizes[0], 70.0);
    assert_eq!(sizes[1], 10.0);
}

#[test]
fn flex_lengths_stay_finite_at_the_admitted_maximum() {
    // Probed AT the maximum rather than trusted from a doc comment: the
    // last time that was trusted the helper returned NaN.
    let sizes = resolve_flex_lengths(1e308, &[item(1e308, 1e308), item(1e308, 1e308)]);
    for s in &sizes {
        assert!(s.is_finite() && *s >= 0.0, "got {s}");
    }
}

#[test]
fn flex_lengths_collapse_a_non_finite_basis_to_zero() {
    let sizes = resolve_flex_lengths(100.0, &[item(f64::NAN, 1.0), item(f64::INFINITY, 1.0)]);
    for s in &sizes {
        assert!(s.is_finite() && *s >= 0.0, "got {s}");
    }
}

#[test]
fn flex_lengths_over_a_full_row_shrink_rather_than_overflow() {
    // Re-pointed when `flex-shrink` landed: this used to assert the bases
    // survived untouched, which took CSS's basis without CSS's
    // shrink. Unbounded children now give the space back.
    let sizes = resolve_flex_lengths(10.0, &[item(80.0, 1.0), item(80.0, 1.0)]);
    assert_eq!(sizes, vec![5.0, 5.0]);
}

#[test]
fn flex_lengths_of_an_empty_row_is_empty() {
    assert!(resolve_flex_lengths(100.0, &[]).is_empty());
}

#[test]
fn flex_lengths_shrink_proportionally_when_the_bases_overflow() {
    // The CSS half that was missing: bases wider than the row are taken
    // back in proportion, so text re-wraps instead of running off the
    // right edge. 120+40 into 80 -> each keeps half of its basis.
    let sizes = resolve_flex_lengths(80.0, &[item(120.0, 1.0), item(40.0, 1.0)]);
    assert_eq!(sizes, vec![60.0, 20.0]);
}

#[test]
fn flex_lengths_shrink_freezes_at_min_width_and_the_rest_absorb_more() {
    // A floored child stops absorbing the deficit; its share moves to the
    // sibling, which is what makes the row still fit.
    let floored = FlexItem {
        basis: 100.0,
        weight: 1.0,
        min: Some(90.0),
        max: None,
    };
    let sizes = resolve_flex_lengths(140.0, &[floored, item(100.0, 1.0)]);
    assert_eq!(sizes[0], 90.0);
    assert_eq!(sizes[1], 50.0);
    assert_eq!(sizes[0] + sizes[1], 140.0);
}

#[test]
fn flex_lengths_shrink_stops_when_every_child_is_at_its_floor() {
    // Bounded below by mins that together exceed the row: the loop must
    // terminate and leave the row overflowing rather than spin or go
    // negative. (`plan_row`'s flex_row_overflow is what reports it.)
    let a = FlexItem {
        basis: 100.0,
        weight: 1.0,
        min: Some(100.0),
        max: None,
    };
    let b = FlexItem {
        basis: 100.0,
        weight: 1.0,
        min: Some(100.0),
        max: None,
    };
    let sizes = resolve_flex_lengths(50.0, &[a, b]);
    assert_eq!(sizes, vec![100.0, 100.0]);
}

#[test]
fn flex_lengths_shrink_never_produces_a_negative_size() {
    let sizes = resolve_flex_lengths(0.0, &[item(50.0, 1.0), item(50.0, 1.0)]);
    for s in &sizes {
        assert!(*s >= 0.0 && s.is_finite(), "got {s}");
    }
}

#[test]
fn flex_lengths_shrink_stays_finite_at_the_admitted_maximum() {
    let sizes = resolve_flex_lengths(100.0, &[item(1e308, 1.0), item(1e308, 1.0)]);
    for s in &sizes {
        assert!(s.is_finite() && *s >= 0.0, "got {s}");
    }
}

#[test]
fn flex_lengths_take_a_min_violation_back_out_of_the_siblings() {
    // A floor ABOVE the item's natural share is the case that separates
    // re-distributing from the bases (CSS §9.7 step 4) from accumulating
    // on top of the previous round. Accumulating clamps the item UP,
    // leaves the siblings at the share they were already handed, and the
    // three sizes then exceed the space they were given — which is what
    // this used to do: 180/100/100 against 300.
    let items = [
        FlexItem {
            basis: 0.0,
            weight: 1.0,
            min: Some(180.0),
            max: None,
        },
        item(0.0, 1.0),
        item(0.0, 1.0),
    ];
    let sizes = resolve_flex_lengths(300.0, &items);
    assert_eq!(sizes, vec![180.0, 60.0, 60.0]);
    assert_eq!(sizes.iter().sum::<f64>(), 300.0);
}

fn bounded(basis: f64, weight: f64, min: Option<f64>, max: Option<f64>) -> FlexItem {
    FlexItem {
        basis,
        weight,
        min,
        max,
    }
}

#[test]
fn flex_lengths_return_the_min_width_for_a_child_with_no_weight() {
    // A content-sized child (flexGrow 0, the default) narrower than its
    // `minWidth` takes the bound, so the row reserves 120 for it rather
    // than its 15pt content and the next child does not overlap it.
    let sizes = resolve_flex_lengths(
        300.0,
        &[bounded(15.0, 0.0, Some(120.0), None), item(16.0, 0.0)],
    );
    assert_eq!(sizes, vec![120.0, 16.0]);
}

#[test]
fn flex_lengths_return_the_max_width_for_a_child_with_no_weight() {
    // maxWidth: a 119pt content capped at 30 returns 30, so the row leaves
    // no gap before the next child.
    let sizes = resolve_flex_lengths(
        300.0,
        &[bounded(119.0, 0.0, None, Some(30.0)), item(16.0, 0.0)],
    );
    assert_eq!(sizes, vec![30.0, 16.0]);
}

#[test]
fn flex_lengths_give_the_width_a_max_capped_child_gives_up_to_its_sibling_when_shrinking() {
    // Two 119pt contents in a 100pt row, the first with a 30pt maxWidth:
    // the first child stays at 30, and the second shrinks only to the 70
    // that is left (CSS
    // §9.7: each round subtracts the deficit from the bases).
    let sizes = resolve_flex_lengths(
        100.0,
        &[bounded(119.0, 0.0, None, Some(30.0)), item(119.0, 0.0)],
    );
    assert_eq!(sizes, vec![30.0, 70.0]);
}

#[test]
fn flex_lengths_decide_the_direction_from_the_clamped_sizes() {
    // The bases (15 + 16) fit a 100pt row, but the first child's 90pt
    // minWidth does not leave room for both: the row shrinks, the first
    // child stays at its 90pt minWidth and the second shrinks to 10.
    let sizes = resolve_flex_lengths(
        100.0,
        &[bounded(15.0, 1.0, Some(90.0), None), item(16.0, 1.0)],
    );
    assert_eq!(sizes, vec![90.0, 10.0]);
}

#[test]
fn flex_lengths_let_min_win_over_max_on_a_child_with_no_weight() {
    let sizes = resolve_flex_lengths(300.0, &[bounded(50.0, 0.0, Some(80.0), Some(20.0))]);
    assert_eq!(sizes, vec![80.0]);
}

#[test]
fn flex_lengths_freeze_a_growing_child_whose_basis_is_over_its_max_width() {
    // A child with a weight whose 80pt basis is over its 30pt maxWidth is
    // frozen at 30 before the loop, so the second child grows into the
    // other 70. Without that freeze the first round would count the 80pt
    // basis, leave 20 of room, and the second child would stop at its 20pt
    // minWidth.
    let sizes = resolve_flex_lengths(
        100.0,
        &[
            bounded(80.0, 1.0, None, Some(30.0)),
            bounded(0.0, 1.0, Some(20.0), None),
        ],
    );
    assert_eq!(sizes, vec![30.0, 70.0]);
}

#[test]
fn flex_lengths_return_the_hypothetical_sizes_when_they_equal_the_free_space() {
    // 90 (a 15pt basis raised to its minWidth) + 10 is exactly 100: no
    // child grows or shrinks.
    let sizes = resolve_flex_lengths(
        100.0,
        &[bounded(15.0, 1.0, Some(90.0), None), item(10.0, 1.0)],
    );
    assert_eq!(sizes, vec![90.0, 10.0]);
}

#[test]
fn flex_lengths_clamp_a_hostile_basis_before_choosing_the_direction() {
    // A 1e308 basis capped at 30 counts as 30: the row grows, the capped
    // child returns 30 and a NaN basis under a minWidth returns its 5pt
    // minWidth.
    let sizes = resolve_flex_lengths(
        100.0,
        &[
            bounded(1e308, 0.0, None, Some(30.0)),
            bounded(f64::NAN, 0.0, Some(5.0), None),
            item(10.0, 0.0),
        ],
    );
    assert_eq!(sizes, vec![30.0, 5.0, 10.0]);
}
