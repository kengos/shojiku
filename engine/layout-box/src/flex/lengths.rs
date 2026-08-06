//! Resolving flexible lengths (CSS Flexbox §9.7): turning each unsized
//! row child's basis into a final main size.
//!
//! Two directions share one shape. When the bases leave room, the
//! leftover is distributed by `flexGrow` weight; when they overflow, the
//! deficit is taken back in proportion to each basis — CSS's
//! `flex-shrink` with every factor at its initial 1, which is what makes
//! a long line of text re-wrap instead of running off the row. Either
//! way, an item whose `minWidth`/`maxWidth` bound is violated is frozen
//! at the clamped size and what it gave up is redistributed to the rest.
//!
//! The loop is over NUMBERS, never over layout: each round freezes at
//! least one item, so it runs at most `items.len()` rounds and the
//! children are placed exactly once afterwards. Written the other way
//! round — lay out, notice the clamp, lay out again — a row nested in a
//! row costs `2^depth`.

use crate::resolve::clamp_size;

use super::grow_shares;

/// One unsized (flex-share) row child, as the resolution sees it: the
/// main size it starts from, its grow weight, and its clamp bounds.
#[derive(Debug, Clone, Copy)]
pub struct FlexItem {
    /// Outer main size before any growth or shrinkage (`flexBasis` plus
    /// horizontal margins).
    pub basis: f64,
    /// `flexGrow` weight, already sanitized by the caller.
    pub weight: f64,
    /// Resolved `minWidth` / `maxWidth` on the OUTER size, if authored.
    pub min: Option<f64>,
    pub max: Option<f64>,
}

/// Resolves every item's final outer main size against `free`, the space
/// the unsized children have to share.
///
/// Every returned size is finite and non-negative: hostile bases and
/// bounds (`1e308`, `NaN`) reach here from templates, and a row cursor
/// must never walk backwards.
pub fn resolve_flex_lengths(free: f64, items: &[FlexItem]) -> Vec<f64> {
    let mut sizes: Vec<f64> = items.iter().map(|i| sane(i.basis)).collect();
    let total: f64 = sizes.iter().sum();
    if total > free {
        shrink_to_fit(&mut sizes, items, free);
    } else {
        grow_to_fill(&mut sizes, items, free);
    }
    sizes.iter().map(|s| sane(*s)).collect()
}

/// The bases leave room: hand it out by `flexGrow` weight, freezing any
/// item that hits a bound.
///
/// Every round re-distributes from the BASES (CSS §9.7 step 4: the free
/// space is the container minus the frozen items' sizes minus the
/// unfrozen items' base sizes), never on top of what the previous round
/// handed out. Accumulating instead is right for as long as every
/// violation is a MAXIMUM — the room simply shrinks — and silently wrong
/// the moment one is a minimum: the room goes negative, the floor keeps
/// the size it was clamped up to, and the siblings keep a share the row
/// cannot afford. A `minWidth` above its natural share used to overflow
/// the row by exactly that difference.
fn grow_to_fill(sizes: &mut [f64], items: &[FlexItem], free: f64) {
    let n = items.len();
    let mut frozen = vec![false; n];
    for _ in 0..n {
        let weights: Vec<f64> = unfrozen(items, &frozen, |i| i.weight);
        if weights.is_empty() {
            return;
        }
        // Every unfrozen item at `flexGrow: 0` (the CSS default) means
        // nobody grows and the leftover stays free space for the
        // caller's `justifyContent`. `grow_shares` would hand out an
        // equal split here — the right answer when a basis is 0 and an
        // ungrown child would be invisible, and the wrong one now that a
        // basis is the child's content.
        if weights.iter().all(|w| *w <= 0.0) {
            return;
        }
        let frozen_sum: f64 = sizes
            .iter()
            .zip(&frozen)
            .filter(|(_, f)| **f)
            .map(|(s, _)| *s)
            .sum();
        let base_sum: f64 = unfrozen(items, &frozen, |i| sane(i.basis)).iter().sum();
        let room = sane(free - frozen_sum - base_sum);
        let shares = grow_shares(room, &weights);
        if !grow_from_bases(sizes, items, &mut frozen, &shares) {
            return;
        }
    }
}

/// Sets each unfrozen item to its base plus this round's share, freezing
/// every one whose bounds the result violates. Returns whether anything
/// froze — nothing frozen means the round settled and the loop is done.
fn grow_from_bases(
    sizes: &mut [f64],
    items: &[FlexItem],
    frozen: &mut [bool],
    shares: &[f64],
) -> bool {
    let mut froze = false;
    let mut share_i = 0;
    for i in 0..sizes.len() {
        if frozen[i] {
            continue;
        }
        let target = sane(sane(items[i].basis) + shares[share_i]);
        share_i += 1;
        let clamped = clamp_size(target, items[i].min, items[i].max);
        sizes[i] = clamped;
        if (clamped - target).abs() > f64::EPSILON {
            frozen[i] = true;
            froze = true;
        }
    }
    froze
}

/// The bases overflow: take the deficit back in proportion to each
/// basis (CSS `flex-shrink: 1` on every item), freezing at `minWidth`.
///
/// Proportional-to-basis is not an approximation of CSS here — it is
/// exactly the scaled shrink factor `basis × shrink` with every shrink
/// at its initial value. An authorable `flexShrink` would weight it
/// further; the wire does not carry one.
fn shrink_to_fit(sizes: &mut [f64], items: &[FlexItem], free: f64) {
    let n = items.len();
    let mut frozen = vec![false; n];
    for _ in 0..n {
        let used: f64 = sizes.iter().sum();
        let deficit = sane(used - free);
        if deficit <= 0.0 {
            return;
        }
        // Weight by the CURRENT size, so an item already frozen at its
        // minimum stops absorbing the deficit its siblings must take.
        let weights: Vec<f64> = unfrozen_sizes(sizes, &frozen);
        if weights.is_empty() {
            return;
        }
        let shares = grow_shares(deficit, &weights);
        if !apply(sizes, items, &mut frozen, &shares, -1.0) {
            return;
        }
    }
}

/// Applies one round's shares (`sign` = +1 to grow, −1 to shrink) and
/// freezes every item whose bounds the result violates. Returns whether
/// anything froze — nothing frozen means the round settled and the loop
/// is done.
fn apply(
    sizes: &mut [f64],
    items: &[FlexItem],
    frozen: &mut [bool],
    shares: &[f64],
    sign: f64,
) -> bool {
    let mut froze = false;
    let mut share_i = 0;
    for i in 0..sizes.len() {
        if frozen[i] {
            continue;
        }
        let target = sane(sizes[i] + sign * shares[share_i]);
        share_i += 1;
        let clamped = clamp_size(target, items[i].min, items[i].max);
        sizes[i] = clamped;
        if (clamped - target).abs() > f64::EPSILON {
            frozen[i] = true;
            froze = true;
        }
    }
    froze
}

/// The unfrozen items' values under `pick`, in order.
fn unfrozen(items: &[FlexItem], frozen: &[bool], pick: fn(&FlexItem) -> f64) -> Vec<f64> {
    items
        .iter()
        .zip(frozen)
        .filter(|(_, f)| !**f)
        .map(|(i, _)| pick(i))
        .collect()
}

/// The unfrozen items' CURRENT sizes, in order — the shrink weights.
fn unfrozen_sizes(sizes: &[f64], frozen: &[bool]) -> Vec<f64> {
    sizes
        .iter()
        .zip(frozen)
        .filter(|(_, f)| !**f)
        .map(|(s, _)| *s)
        .collect()
}

/// Collapses a non-finite or negative main size to a usable one.
fn sane(v: f64) -> f64 {
    if v.is_finite() {
        v.max(0.0)
    } else {
        0.0
    }
}
