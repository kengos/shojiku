//! The flex harness: one input per flag, and the property failures it
//! catches.

use super::*;

#[test]
fn every_kind_of_row_sets_its_flag() {
    let grow = flex("free=100 justify=between align=center auto=lt\n10 1\n20 2\n");
    assert!(grow.grow && grow.spread && !grow.hostile);
    let bounded = flex("free=100\n10 1\n20 2 - 25\n");
    assert!(bounded.max_bound && !bounded.grow);
    assert!(flex("free=50 justify=around\n40 0\n40 0\n").shrink);
    assert!(flex("free=50\n40 0 30\n40 0\n").min_bound);
    let inflexible = flex("free=100 justify=evenly align=end\n5 0 10\n");
    assert!(inflexible.inflexible && inflexible.inflexible_bound && inflexible.min_bound);
    assert!(flex("free=NaN\n1e308 NaN\n").hostile);
    assert!(flex("free=-5 justify=center align=start auto=l\n1 1\n").shrink);
    assert!(flex("free=10 align=stretch justify=between\n1 1\n").grow);
}

#[test]
fn a_row_that_a_no_op_engine_also_passes_sets_no_flag() {
    // No items: every check runs over an empty set.
    assert_eq!(
        flex("free=10 justify=end align=baseline auto=t\n"),
        FlexPaths::default()
    );
    assert_eq!(flex("free=-1\n"), FlexPaths::default());
    assert_eq!(flex("free=NaN\n"), FlexPaths::default());
    // The bases already fill the row, so nothing grows or shrinks.
    assert_eq!(flex("free=10\n4 1\n6 1\n"), FlexPaths::default());
    // Every weighted item is frozen at its maxWidth before growing.
    assert!(!flex("free=10\n10 1 - 5\n").grow);
    // The grown size equals the minWidth without the minWidth acting.
    assert!(!flex("free=7\n5 1 7\n").min_bound);
    assert!(!flex("free=40\n30 1 - 40\n").max_bound);
    // A basis equal to its bound is not clamped.
    assert!(!flex("free=10\n10 0 10\n").min_bound);
    // Sharing out the room would also end at the maxWidth.
    assert!(!flex("free=100\n10 0 - 10\n").inflexible);
    // A free space within the tolerance of zero.
    assert!(!flex("free=1e-10 justify=around\n1 1\n").spread);
}

#[test]
fn space_between_with_one_child_distributes_nothing() {
    let paths = flex("free=10 justify=between\n5 1\n");
    assert!(paths.grow && !paths.spread);
}

#[test]
fn a_non_finite_weight_is_outside_the_caller_range() {
    assert!(flex("free=10\n5 inf\n").hostile);
}

#[test]
fn a_subnormal_weight_is_outside_the_caller_range() {
    assert!(flex("free=0.3\n0 5e-324\n").hostile);
}

#[test]
fn an_item_line_reads_missing_tokens_as_defaults() {
    let it = item("x");
    assert!(it.basis == 0.0 && it.weight == 0.0 && it.min.is_none() && it.max.is_none());
}

#[test]
#[should_panic(expected = "do not add up to the free space")]
fn sizes_that_miss_the_free_space_fail() {
    let items = [FlexItem {
        basis: 1.0,
        weight: 1.0,
        min: None,
        max: None,
    }];
    check_caller(10.0, &items, &[5.0], &mut FlexPaths::default());
}

#[test]
#[should_panic(expected = "under its minWidth")]
fn a_size_under_its_minimum_fails() {
    let items = [FlexItem {
        basis: 1.0,
        weight: 1.0,
        min: Some(8.0),
        max: None,
    }];
    check_caller(10.0, &items, &[5.0], &mut FlexPaths::default());
}

#[test]
#[should_panic(expected = "over its maxWidth")]
fn a_size_over_its_maximum_fails() {
    let items = [FlexItem {
        basis: 1.0,
        weight: 1.0,
        min: None,
        max: Some(2.0),
    }];
    check_caller(10.0, &items, &[5.0], &mut FlexPaths::default());
}

#[test]
#[should_panic(expected = "is not its clamped basis")]
fn an_inflexible_item_that_moves_fails() {
    let items = [FlexItem {
        basis: 1.0,
        weight: 0.0,
        min: None,
        max: None,
    }];
    check_caller(10.0, &items, &[2.0], &mut FlexPaths::default());
}
