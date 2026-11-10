//! The flex-distribution harness the `box_flex` fuzz target and the corpus
//! replay test both run.
//!
//! A `row` passes its unsized children's bases, `flexGrow` weights and
//! `minWidth`/`maxWidth` bounds to [`resolve_flex_lengths`], then places
//! the leftover with auto margins and `justifyContent`, and each child on
//! the cross axis with `alignItems`. The harness asserts, for any input:
//! every resolved size is finite and non-negative, there is one per item,
//! and the same input resolves to the same sizes twice; with a finite free
//! space, the spacing, auto-margin and grow shares are finite, `space_*`
//! never distributes more than the free space (and distributes all of it
//! when there is any and a gap to put it in), and an auto cross margin
//! keeps the child within the free space. For input a caller can pass
//! (every value finite, within `MAX_RESOLVED_PT`, bases not negative, and
//! each weight 0 or at least `f64::MIN_POSITIVE`), it also asserts:
//! every size is within its bounds (`minWidth` winning over `maxWidth`);
//! when the bases clamped to their bounds fit the free space and no item
//! has a weight, every item gets its clamped basis; and with no bounds at
//! all the sizes add up to the free space (to zero, when the free space is
//! negative) unless no item has a weight in a row with room.

use super::{assert_close, body_lines, close, in_range, number, setting};
use crate::{FlexItem, clamp_size, resolve_flex_lengths};
use shojiku_core::{AlignItems, JustifyContent};
use spacing::{check_shares, check_spacing};

mod spacing;
#[cfg(test)]
mod tests;

/// Which assertions one input checked on a result a no-op engine would not
/// give, for the replay test's positive controls.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct FlexPaths {
    /// In an unbounded row with room, the sizes add up to the free space
    /// and the bases do not.
    pub grow: bool,
    /// In an unbounded row without room, the sizes add up to the free
    /// space (zero when negative) and the bases do not.
    pub shrink: bool,
    /// In a row with room left over and no weight, every item kept its
    /// clamped basis, where sharing out the room would not.
    pub inflexible: bool,
    /// In a row with room and no weight, an item kept a clamped basis
    /// other than its basis.
    pub inflexible_bound: bool,
    /// A size is at its item's `minWidth`, and the same row without that
    /// `minWidth` resolves the item under it.
    pub min_bound: bool,
    /// A size is at its item's `maxWidth`, and the same row without that
    /// `maxWidth` resolves the item over it.
    pub max_bound: bool,
    /// `space_*` distributed a positive free space.
    pub spread: bool,
    /// A row of at least one item held a value outside the caller range.
    pub hostile: bool,
}

/// One input's container settings.
struct Row {
    free: f64,
    justify: JustifyContent,
    align: AlignItems,
    auto_lead: bool,
    auto_trail: bool,
}

/// Reads the settings line: `free=<number>`, `justify=<start|center|end|
/// between|around|evenly>`, `align=<stretch|start|center|end|baseline>`,
/// and `auto=` with `l` and/or `t` for auto cross margins.
fn row(line: &str) -> Row {
    let auto = setting(line, "auto").unwrap_or_default();
    Row {
        free: setting(line, "free").and_then(number).unwrap_or(0.0),
        justify: match setting(line, "justify") {
            Some("center") => JustifyContent::Center,
            Some("end") => JustifyContent::End,
            Some("between") => JustifyContent::SpaceBetween,
            Some("around") => JustifyContent::SpaceAround,
            Some("evenly") => JustifyContent::SpaceEvenly,
            _ => JustifyContent::Start,
        },
        align: match setting(line, "align") {
            Some("start") => AlignItems::Start,
            Some("center") => AlignItems::Center,
            Some("end") => AlignItems::End,
            Some("baseline") => AlignItems::Baseline,
            _ => AlignItems::Stretch,
        },
        auto_lead: auto.contains('l'),
        auto_trail: auto.contains('t'),
    }
}

/// Reads one item line: `<basis> <weight> <min> <max>`; a missing or
/// unparseable basis or weight is 0, and such a bound is unset.
fn item(line: &str) -> FlexItem {
    let mut tokens = line.split_whitespace();
    let mut next = || tokens.next().and_then(number);
    FlexItem {
        basis: next().unwrap_or(0.0),
        weight: next().unwrap_or(0.0),
        min: next(),
        max: next(),
    }
}

/// Resolves one fuzz input's row and asserts the properties in the module
/// documentation. The first line holds the settings (see [`row`]); each
/// following non-blank line, up to 64, is an item (see [`item`]).
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn flex(input: &str) -> FlexPaths {
    let row = row(input.split('\n').next().unwrap_or_default());
    let items: Vec<FlexItem> = body_lines(input).map(item).collect();
    let sizes = resolve_flex_lengths(row.free, &items);
    let again = resolve_flex_lengths(row.free, &items);
    assert!(
        sizes
            .iter()
            .map(|s| s.to_bits())
            .eq(again.iter().map(|s| s.to_bits())),
        "the same row resolved to different sizes"
    );
    assert_eq!(sizes.len(), items.len(), "the sizes are not one per item");
    assert!(
        sizes.iter().all(|s| s.is_finite() && *s >= 0.0),
        "a resolved size is not finite and non-negative: {sizes:?}"
    );
    let mut paths = FlexPaths::default();
    if row.free.is_finite() {
        check_spacing(&row, items.len(), &mut paths);
        check_shares(row.free, &items);
    }
    let caller = in_range(row.free)
        && items.iter().all(|i| {
            in_range(i.basis)
                && i.basis >= 0.0
                && (i.weight == 0.0 || (in_range(i.weight) && i.weight >= f64::MIN_POSITIVE))
                && i.min.is_none_or(in_range)
                && i.max.is_none_or(in_range)
        });
    if caller {
        check_caller(row.free, &items, &sizes, &mut paths);
    } else {
        paths.hostile = !sizes.is_empty();
    }
    paths
}

/// Checks the sizes of an input a caller can pass.
fn check_caller(free: f64, items: &[FlexItem], sizes: &[f64], paths: &mut FlexPaths) {
    // The hypothetical sizes (CSS §9.7 step 1): each basis clamped to its
    // bounds, never negative.
    let clamped: Vec<f64> = items
        .iter()
        .map(|i| clamp_size(i.basis, i.min, i.max).max(0.0))
        .collect();
    let clamped_sum: f64 = clamped.iter().sum();
    let grows = clamped_sum <= free;
    let inflexible = grows && items.iter().all(|i| i.weight <= 0.0);
    if inflexible {
        for ((size, want), item) in sizes.iter().zip(&clamped).zip(items) {
            // Compared as values: `resolve_flex_lengths` returns a basis of
            // `-0` as `0`.
            assert!(
                size == want,
                "an item with no weight in a row with room is not its clamped basis"
            );
            paths.inflexible_bound |= *size != item.basis;
        }
        // `grow_shares` shares room out equally when every weight is 0, so
        // an engine that did not freeze the items resolves the row as if
        // every weight were 1.
        let weighted: Vec<FlexItem> = items
            .iter()
            .map(|i| FlexItem { weight: 1.0, ..*i })
            .collect();
        let shared = resolve_flex_lengths(free, &weighted);
        paths.inflexible |= shared.iter().zip(&clamped).any(|(s, c)| s != c);
    }
    for (at, (size, item)) in sizes.iter().zip(items).enumerate() {
        let min = item.min.filter(|min| *min >= 0.0);
        if let Some(min) = min {
            assert!(*size >= min, "a size {size} is under its minWidth {min}");
            if *size == min {
                let unbounded = FlexItem { min: None, ..*item };
                paths.min_bound |= resolve_with(free, items, at, unbounded) < min;
            }
        }
        if let Some(max) = item.max.filter(|max| *max >= min.unwrap_or(0.0)) {
            assert!(*size <= max, "a size {size} is over its maxWidth {max}");
            if *size == max {
                let unbounded = FlexItem { max: None, ..*item };
                paths.max_bound |= resolve_with(free, items, at, unbounded) > max;
            }
        }
    }
    if !inflexible && items.iter().all(|i| i.min.is_none() && i.max.is_none()) {
        let want = if grows { free } else { free.max(0.0) };
        let scale = items.iter().map(|i| i.basis).sum();
        assert_close(
            sizes.iter().sum(),
            want,
            scale,
            "the sizes do not add up to the free space",
        );
        let moved = !close(clamped_sum, want, scale);
        if grows {
            paths.grow |= moved;
        } else {
            paths.shrink |= moved;
        }
    }
}

/// The size the item at `at` resolves to in the same row with `item` in
/// its place.
fn resolve_with(free: f64, items: &[FlexItem], at: usize, item: FlexItem) -> f64 {
    let mut row = items.to_vec();
    row[at] = item;
    resolve_flex_lengths(free, &row)[at]
}
