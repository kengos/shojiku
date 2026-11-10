//! Resolving flexible lengths (CSS Flexbox §9.7): turning each unsized
//! row child's basis into a final main size.
//!
//! Two directions share one shape. When the hypothetical sizes (each
//! basis clamped to its `minWidth`/`maxWidth`) fit in `free`, the
//! remaining space is distributed by `flexGrow` weight; when they exceed
//! it, the deficit is subtracted in proportion to each basis — CSS's
//! `flex-shrink` with every factor at its initial 1, which is what makes
//! a long line of text re-wrap instead of running off the row. An item
//! that cannot grow (when the row grows) or shrink (when the row shrinks)
//! is frozen at its hypothetical size first; then an item whose bound the
//! distribution violates is frozen at that bound, and the difference
//! between its target and the bound is distributed to the unfrozen
//! items.
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
///
/// Follows CSS §9.7 steps 1 and 2 before the loop: each item's
/// hypothetical size (its basis clamped to its bounds) decides whether the
/// row grows or shrinks, and an item that cannot grow (or shrink) when the
/// row grows (or shrinks) is frozen at its hypothetical size before the
/// loop. In a growing row, a child with no weight returns its basis
/// clamped to its `minWidth`/`maxWidth`; in a shrinking row it never ends
/// under its `minWidth`, and can end under its `maxWidth`.
pub fn resolve_flex_lengths(free: f64, items: &[FlexItem]) -> Vec<f64> {
    let mut sizes: Vec<f64> = items.iter().map(hypothetical).collect();
    let total: f64 = sizes.iter().sum();
    let grows = total <= free;
    let mut frozen: Vec<bool> = items
        .iter()
        .zip(&sizes)
        .map(|(item, hypo)| inflexible(item, *hypo, grows))
        .collect();
    if grows {
        grow_to_fill(&mut sizes, items, &mut frozen, free);
    } else {
        shrink_to_fit(&mut sizes, items, &mut frozen, free);
    }
    sizes.iter().map(|s| sane(*s)).collect()
}

/// An item's hypothetical main size: its basis clamped to its bounds (CSS
/// §9.2; §9.7 step 1 sums these sizes).
fn hypothetical(item: &FlexItem) -> f64 {
    sane(clamp_size(sane(item.basis), item.min, item.max))
}

/// Whether an item is frozen at its hypothetical size before the loop (CSS
/// §9.7 step 2): when the row grows, an item with weight 0 or a basis
/// above its `maxWidth`; when the row shrinks, an item with a basis below
/// its `minWidth`.
fn inflexible(item: &FlexItem, hypo: f64, grows: bool) -> bool {
    let base = sane(item.basis);
    if grows {
        item.weight <= 0.0 || base > hypo
    } else {
        base < hypo
    }
}

/// The hypothetical sizes fit in `free`: distribute the room by
/// `flexGrow` weight, freezing any item that reaches a bound.
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
///
/// An item with weight 0 was frozen before the loop, so when no item has a
/// weight above 0 the space the sizes do not use is left for the caller's
/// auto margins and `justifyContent`.
fn grow_to_fill(sizes: &mut [f64], items: &[FlexItem], frozen: &mut [bool], free: f64) {
    for _ in 0..items.len() {
        let weights: Vec<f64> = unfrozen(items, frozen, |i| i.weight);
        if weights.is_empty() {
            return;
        }
        let room = sane(free - frozen_sum(sizes, frozen) - base_sum(items, frozen));
        let shares = grow_shares(room, &weights);
        if !from_bases(sizes, items, frozen, &shares, 1.0) {
            return;
        }
    }
}

/// The hypothetical sizes exceed `free`: subtract the deficit in
/// proportion to each basis (CSS `flex-shrink: 1` on every item),
/// freezing any item that reaches a bound.
///
/// Proportional-to-basis is not an approximation of CSS here — it is
/// exactly the scaled shrink factor `basis × shrink` with every shrink
/// at its initial value. An authorable `flexShrink` would weight it
/// further; the wire does not carry one. Like growing, every round
/// re-distributes from the bases: the deficit is the frozen items' sizes
/// plus the unfrozen items' bases, minus `free`.
fn shrink_to_fit(sizes: &mut [f64], items: &[FlexItem], frozen: &mut [bool], free: f64) {
    for _ in 0..items.len() {
        let bases: Vec<f64> = unfrozen(items, frozen, |i| sane(i.basis));
        if bases.is_empty() {
            return;
        }
        let deficit = sane(frozen_sum(sizes, frozen) + base_sum(items, frozen) - free);
        let shares = grow_shares(deficit, &bases);
        if !from_bases(sizes, items, frozen, &shares, -1.0) {
            return;
        }
    }
}

/// Sets each unfrozen item to its base plus (`sign` = +1) or minus
/// (`sign` = −1) this round's share, freezing every one whose bounds the
/// result violates. Returns whether anything froze — nothing frozen means
/// the round settled and the loop is done.
fn from_bases(
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
        let target = sane(sane(items[i].basis) + sign * shares[share_i]);
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

/// The frozen items' current sizes, summed.
fn frozen_sum(sizes: &[f64], frozen: &[bool]) -> f64 {
    sizes
        .iter()
        .zip(frozen)
        .filter(|(_, f)| **f)
        .map(|(s, _)| *s)
        .sum()
}

/// The unfrozen items' bases, summed.
fn base_sum(items: &[FlexItem], frozen: &[bool]) -> f64 {
    unfrozen(items, frozen, |i| sane(i.basis)).iter().sum()
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

/// Collapses a non-finite or negative main size to a usable one.
fn sane(v: f64) -> f64 {
    if v.is_finite() { v.max(0.0) } else { 0.0 }
}
