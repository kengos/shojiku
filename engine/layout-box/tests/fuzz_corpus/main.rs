//! The box fuzz corpora (`box_flex`, `box_resolve`), replayed through the
//! same harnesses the fuzz targets call.
//!
//! Nothing in CI builds `engine/fuzz`, so this replay runs every committed
//! seed through the harness assertions, and a change under which any seed
//! fails a harness assertion fails CI between on-demand fuzz runs. Each
//! harness returns the assertions a seed checked on a result a no-op
//! engine would not give, and the replay asserts that some seed checked
//! each one.

use shojiku_layout_box::fuzz::{flex, resolve};

/// Every UTF-8 seed committed for one fuzz target.
fn corpus(target: &str) -> Vec<String> {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../fuzz/corpus")
        .join(target);
    let mut seeds = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the corpus directory") {
        let path = entry.expect("a corpus entry").path();
        if let Ok(text) = String::from_utf8(std::fs::read(&path).expect("a corpus file")) {
            seeds.push(text);
        }
    }
    // An empty directory would make every loop run zero times and still pass.
    assert!(!seeds.is_empty(), "{target}: the corpus holds no seeds");
    seeds
}

#[test]
fn every_flex_seed_keeps_the_distribution_properties() {
    let seeds = corpus("box_flex");
    assert!(seeds.len() >= 10, "the committed flex seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|text| flex(text)).collect();
    for (ran, what) in [
        (paths.iter().any(|p| p.grow), "a row that grows"),
        (paths.iter().any(|p| p.shrink), "a row that shrinks"),
        (paths.iter().any(|p| p.inflexible), "a row with no weight"),
        (
            paths.iter().any(|p| p.inflexible_bound),
            "an inflexible basis outside its bounds",
        ),
        (paths.iter().any(|p| p.min_bound), "a size at its minWidth"),
        (paths.iter().any(|p| p.max_bound), "a size at its maxWidth"),
        (
            paths.iter().any(|p| p.spread),
            "space_* distributing a positive free space",
        ),
        (
            paths.iter().any(|p| p.hostile),
            "a value outside the caller range",
        ),
    ] {
        assert!(ran, "no flex seed runs {what}");
    }
}

#[test]
fn every_resolve_seed_keeps_the_length_and_track_properties() {
    let seeds = corpus("box_resolve");
    assert!(seeds.len() >= 8, "the committed resolve seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|text| resolve(text)).collect();
    for (ran, what) in [
        (paths.iter().any(|p| p.kept), "a kept length"),
        (
            paths.iter().any(|p| p.out_of_range),
            "a length out of range",
        ),
        (
            paths.iter().any(|p| p.percent_of_auto),
            "a % against an auto height",
        ),
        (paths.iter().any(|p| p.percent), "a % length"),
        (paths.iter().any(|p| p.font_relative), "an em or rem length"),
        (paths.iter().any(|p| p.physical), "a physical-unit length"),
        (
            paths.iter().any(|p| p.clamped_min),
            "a size clamped up to its minimum",
        ),
        (
            paths.iter().any(|p| p.clamped_max),
            "a size clamped down to its maximum",
        ),
        (
            paths.iter().any(|p| p.tracks),
            "equal tracks that fill the total",
        ),
        (
            paths.iter().any(|p| p.offsets),
            "a track offset past the start",
        ),
    ] {
        assert!(ran, "no resolve seed runs {what}");
    }
}
