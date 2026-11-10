//! The `box_flex` checks of the functions that place a row's leftover
//! space and share it by weight: `main_spacing`, `cross_offset`,
//! `auto_share`, `equal_share` and `grow_shares`.

use super::{FlexPaths, Row};
use crate::fuzz::{assert_at_most, assert_close, close};
use crate::{FlexItem, auto_share, cross_offset, equal_share, grow_shares, main_spacing};
use shojiku_core::JustifyContent;

/// Checks the main-axis spacing, the cross offset and the auto-margin and
/// equal shares for a finite free space.
pub(super) fn check_spacing(row: &Row, count: usize, paths: &mut FlexPaths) {
    let free = row.free;
    let (lead, between) = main_spacing(free, count, row.justify);
    assert!(
        lead.is_finite() && between.is_finite(),
        "the spacing is not finite"
    );
    let spread = matches!(
        row.justify,
        JustifyContent::SpaceBetween | JustifyContent::SpaceAround | JustifyContent::SpaceEvenly
    );
    if spread {
        assert!(
            lead >= 0.0 && between >= 0.0,
            "a space_* spacing is negative"
        );
        let gaps = count.saturating_sub(1) as f64;
        let outer = if row.justify == JustifyContent::SpaceBetween {
            0.0
        } else {
            2.0 * lead
        };
        let distributed = outer + between * gaps;
        if count >= 2 || (count == 1 && row.justify != JustifyContent::SpaceBetween) {
            assert_close(
                distributed,
                free.max(0.0),
                0.0,
                "space_* did not distribute the free space",
            );
            paths.spread |= !close(0.0, free.max(0.0), 0.0);
        } else {
            assert!(
                distributed == 0.0,
                "space_* distributed space with no gap to put it in"
            );
        }
    }
    let offset = cross_offset(free, row.align, row.auto_lead, row.auto_trail);
    assert!(offset.is_finite(), "the cross offset is not finite");
    if row.auto_lead || row.auto_trail {
        assert!(
            (0.0..=free.max(0.0)).contains(&offset),
            "an auto cross margin moved the child outside the free space"
        );
    }
    let share = auto_share(free, count);
    assert!(
        share.is_finite() && share >= 0.0,
        "an auto-margin share is negative"
    );
    assert_at_most(
        share * count as f64,
        free.max(0.0),
        "the auto margins absorb more than the free space",
    );
    let equal = equal_share(free, count);
    assert!(
        equal.is_finite() && equal >= 0.0,
        "an equal share is negative"
    );
}

/// Checks the weighted grow shares of the items' finite weights.
pub(super) fn check_shares(free: f64, items: &[FlexItem]) {
    let weights: Vec<f64> = items.iter().map(|i| i.weight).collect();
    if !weights.iter().all(|w| w.is_finite()) {
        return;
    }
    let shares = grow_shares(free, &weights);
    assert_eq!(
        shares.len(),
        weights.len(),
        "the grow shares are not one per weight"
    );
    assert!(
        shares.iter().all(|s| s.is_finite() && *s >= 0.0),
        "a grow share is not finite and non-negative: {shares:?}"
    );
    assert_at_most(
        shares.iter().sum(),
        free.max(0.0),
        "the grow shares distribute more than the free space",
    );
}
