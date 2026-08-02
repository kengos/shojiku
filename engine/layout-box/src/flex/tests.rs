//! Unit tests for the flex distribution math: every justify/align
//! variant against positive, zero, and negative free space, and the
//! division guards hostile templates require.

use super::*;

#[test]
fn main_spacing_positional_variants() {
    assert_eq!(main_spacing(30.0, 3, JustifyContent::Start), (0.0, 0.0));
    assert_eq!(main_spacing(30.0, 3, JustifyContent::Center), (15.0, 0.0));
    assert_eq!(main_spacing(30.0, 3, JustifyContent::End), (30.0, 0.0));
}

#[test]
fn main_spacing_distributing_variants() {
    assert_eq!(
        main_spacing(30.0, 3, JustifyContent::SpaceBetween),
        (0.0, 15.0)
    );
    assert_eq!(
        main_spacing(30.0, 3, JustifyContent::SpaceAround),
        (5.0, 10.0)
    );
    assert_eq!(
        main_spacing(28.0, 3, JustifyContent::SpaceEvenly),
        (7.0, 7.0)
    );
}

#[test]
fn main_spacing_negative_free_space_degrades_like_css() {
    // space_* behave like start; center/end may shift negative but stay
    // finite.
    assert_eq!(
        main_spacing(-10.0, 2, JustifyContent::SpaceBetween),
        (0.0, 0.0)
    );
    assert_eq!(
        main_spacing(-10.0, 2, JustifyContent::SpaceAround),
        (0.0, 0.0)
    );
    assert_eq!(
        main_spacing(-10.0, 2, JustifyContent::SpaceEvenly),
        (0.0, 0.0)
    );
    assert_eq!(main_spacing(-10.0, 2, JustifyContent::Center), (-5.0, 0.0));
    assert_eq!(main_spacing(-10.0, 2, JustifyContent::End), (-10.0, 0.0));
}

#[test]
fn main_spacing_division_guards() {
    // A single child cannot divide by zero under space_between.
    assert_eq!(
        main_spacing(30.0, 1, JustifyContent::SpaceBetween),
        (0.0, 0.0)
    );
    // Zero children short-circuit every variant.
    assert_eq!(
        main_spacing(30.0, 0, JustifyContent::SpaceAround),
        (0.0, 0.0)
    );
}

#[test]
fn main_spacing_extreme_inputs_stay_finite() {
    let (lead, between) = main_spacing(1e6, 1000, JustifyContent::SpaceEvenly);
    assert!(lead.is_finite() && between.is_finite());
    let (lead, _) = main_spacing(-1e6, 1000, JustifyContent::Center);
    assert!(lead.is_finite());
}

#[test]
fn cross_offset_align_variants() {
    assert_eq!(cross_offset(20.0, AlignItems::Stretch, false, false), 0.0);
    assert_eq!(cross_offset(20.0, AlignItems::Start, false, false), 0.0);
    assert_eq!(cross_offset(20.0, AlignItems::Center, false, false), 10.0);
    assert_eq!(cross_offset(20.0, AlignItems::End, false, false), 20.0);
    // center/end follow the (possibly negative) free space.
    assert_eq!(cross_offset(-8.0, AlignItems::Center, false, false), -4.0);
}

#[test]
fn cross_offset_auto_margins_override_alignment() {
    // Both auto: centered even under `end`.
    assert_eq!(cross_offset(20.0, AlignItems::End, true, true), 10.0);
    // Leading auto pushes to the far side even under `start`.
    assert_eq!(cross_offset(20.0, AlignItems::Start, true, false), 20.0);
    // Trailing auto pins to the near side even under `end`.
    assert_eq!(cross_offset(20.0, AlignItems::End, false, true), 0.0);
    // Auto shares clamp at zero when the child overflows.
    assert_eq!(cross_offset(-5.0, AlignItems::Start, true, true), 0.0);
    assert_eq!(cross_offset(-5.0, AlignItems::Start, true, false), 0.0);
}

#[test]
fn auto_share_guards_count_and_negative_space() {
    assert_eq!(auto_share(30.0, 2), 15.0);
    assert_eq!(auto_share(30.0, 0), 0.0);
    assert_eq!(auto_share(-30.0, 2), 0.0);
    assert_eq!(auto_share(0.0, 2), 0.0);
}

#[test]
fn equal_share_guards_count_and_clamps_negative() {
    assert_eq!(equal_share(90.0, 3), 30.0);
    assert_eq!(equal_share(-90.0, 3), 0.0);
    assert_eq!(equal_share(90.0, 0), 0.0);
}

#[test]
fn grow_shares_splits_by_weight() {
    // Equal weights match the old equal split; 2:1 splits proportionally.
    assert_eq!(grow_shares(90.0, &[1.0, 1.0, 1.0]), vec![30.0, 30.0, 30.0]);
    assert_eq!(grow_shares(90.0, &[2.0, 1.0]), vec![60.0, 30.0]);
    // A single child takes it all; a zero-weight sibling takes nothing.
    assert_eq!(grow_shares(50.0, &[3.0]), vec![50.0]);
    assert_eq!(grow_shares(60.0, &[0.0, 2.0]), vec![0.0, 60.0]);
}

#[test]
fn grow_shares_guards_degenerate_inputs() {
    // All-zero weights degrade to an equal split (never a silent empty row).
    assert_eq!(grow_shares(90.0, &[0.0, 0.0, 0.0]), vec![30.0, 30.0, 30.0]);
    // Negative free clamps every share to 0; a negative weight contributes
    // nothing (the caller warns); NaN weight is dropped by `f64::max`.
    assert_eq!(grow_shares(-90.0, &[1.0, 1.0]), vec![0.0, 0.0]);
    assert_eq!(grow_shares(80.0, &[-5.0, 3.0]), vec![0.0, 80.0]);
    assert_eq!(grow_shares(80.0, &[f64::NAN, 1.0]), vec![0.0, 80.0]);
    // Empty input yields no shares.
    assert_eq!(grow_shares(90.0, &[]), Vec::<f64>::new());
}

#[test]
fn grow_shares_stays_finite_under_hostile_scale_weights() {
    // A single huge weight: `avail × w` overflows to inf; the ratio-first
    // fallback restores the exact answer (the sole track takes it all).
    assert_eq!(grow_shares(200.0, &[1e308]), vec![200.0]);
    // Two huge weights overflow the SUM too (inf/inf = NaN without the
    // guard); each ratio is w/inf = 0, so both shares collapse to 0.
    assert_eq!(grow_shares(200.0, &[1e308, 1e308]), vec![0.0, 0.0]);
    // A huge weight beside a normal one: the huge track takes ~all.
    let shares = grow_shares(200.0, &[1e308, 1.0]);
    assert!(shares.iter().all(|s| s.is_finite()), "{shares:?}");
    assert_eq!(shares[0], 200.0);
}
