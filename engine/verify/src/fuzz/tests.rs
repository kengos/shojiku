//! Replays the committed corpus through the entry points the fuzzer drives.
//!
//! Two jobs. The targets in `engine/fuzz` are built by nothing the CI gates
//! run, so without this they rot silently — a renamed function is found the
//! next time someone fuzzes, which may be months. And a crash the fuzzer
//! ever finds is a file dropped into the same directory, which makes it a
//! regression test here without anyone writing one.

use std::path::PathBuf;

/// Every seed committed for one fuzz target.
///
/// Locally the directory may also hold `generated-` seeds (a signed document
/// cannot be committed) and inputs a fuzzing run kept; replaying those too
/// is free and strictly more coverage.
fn corpus(target: &str) -> Vec<Vec<u8>> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../fuzz/corpus")
        .join(target);
    let mut seeds = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the corpus directory") {
        let path = entry.expect("a corpus entry").path();
        seeds.push(std::fs::read(&path).expect("a corpus file"));
    }
    // A directory that has lost its seeds would make every loop below run
    // zero times and pass — the failure this assertion exists to prevent.
    assert!(!seeds.is_empty(), "the corpus directory holds no seeds");
    seeds
}

#[test]
fn every_contents_window_seed_is_answered_without_panicking() {
    let seeds = corpus("contents_window");
    assert!(seeds.len() >= 3, "the committed window seeds are missing");
    for seed in seeds {
        let _ = super::decode_contents_window(&seed);
    }
}

#[test]
fn every_cms_container_seed_is_answered_without_panicking() {
    let seeds = corpus("cms_container");
    assert!(seeds.len() >= 2, "the container seeds are missing");
    for seed in seeds {
        let _ = super::decode_container(&seed);
    }
}

#[test]
fn a_bracketed_window_of_hexadecimal_digits_decodes_to_its_bytes() {
    assert!(super::decode_contents_window(b"<30030201>").is_ok());
    assert!(super::decode_contents_window(b"<3003020>").is_err());
}
