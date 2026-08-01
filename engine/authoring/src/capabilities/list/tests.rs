//! Unit tests for the composed capability registry: the per-concern key
//! slices must reach `CAPABILITIES` intact, in wire order, exactly once.

use super::*;

/// `flatten` runs at compile time for `CAPABILITIES`; calling it here
/// pins the composition against the group slices it is built from — a
/// mis-wired `GROUPS` (a concern listed twice, or dropped) would keep
/// compiling otherwise.
#[test]
fn the_registry_is_every_concerns_keys_concatenated_in_wire_order() {
    let expected: Vec<&str> = GROUPS.iter().flat_map(|g| g.iter().copied()).collect();

    assert_eq!(flatten().to_vec(), expected);
    assert_eq!(CAPABILITIES, expected.as_slice());
    assert_eq!(CAPABILITIES.len(), TOTAL);
}

/// Keys are an append-only contract, so the same feature must not be
/// advertised twice — the risk the per-concern split introduces (a key
/// appended to the wrong module, then again to the right one).
#[test]
fn no_capability_key_is_declared_twice() {
    let mut sorted: Vec<&str> = CAPABILITIES.to_vec();
    sorted.sort_unstable();
    let total = sorted.len();
    sorted.dedup();

    assert_eq!(sorted.len(), total, "a capability key is declared twice");
}

/// Each concern module owns a distinct slice of the registry: an empty
/// one means a split lost its keys.
#[test]
fn every_concern_contributes_keys() {
    assert!(GROUPS.iter().all(|g| !g.is_empty()));
    assert_eq!(GROUPS.len(), 4);
}
