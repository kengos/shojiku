//! The two claims that need the generator: drift, and determinism.
//!
//! These are what `make reference-check` exists for. They are feature-gated
//! because the derive is — a default build links none of schemars — so the
//! workspace coverage gate never sees them, which is exactly why the
//! artifact's own properties are pinned in the sibling file instead.

use crate::reference::{generate, CATALOG};

/// A key added to the wire without regenerating is a red gate, not a silent
/// lie. The failure names the fix rather than printing a 64 KB diff.
#[test]
fn the_committed_catalog_matches_a_fresh_generation() {
    let fresh = generate();
    assert!(
        fresh == CATALOG,
        "the committed catalog is {} bytes and the parser now yields {} — \
         run `make reference-data` and commit the result",
        CATALOG.len(),
        fresh.len(),
    );
}

/// Two runs in one process must produce the same bytes, or the drift gate
/// flakes and stops meaning anything. The definition map is a `BTreeMap`
/// (`preserve_order` deliberately not enabled) and nothing in generation
/// reads the clock, the filesystem or the environment.
#[test]
fn generation_is_deterministic() {
    assert_eq!(generate(), generate());
}
