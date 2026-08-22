//! The fuzz corpus for the core wire doors, replayed through the same
//! public entry points the fuzz targets call.
//!
//! Nothing in CI builds `engine/fuzz` — it is nightly-only, libFuzzer-linked
//! and deliberately outside the workspace — so this suite is what keeps the
//! corpus and the targets honest between on-demand fuzzing runs, and it is
//! where a crash the fuzzer finds becomes a regression test: drop the input
//! into `engine/fuzz/corpus/<target>/` and it is replayed from then on.
//!
//! The bar is "does not panic". Every door here returns a `Result` or a
//! warning list, so a seed being REFUSED is a pass — the defect these guard
//! against is a panic on a boundary, not a rejection.

use shojiku_core::{parse_aozora_ruby, parse_definitions, parse_params, parse_template, Catalog};

/// Every seed committed for one fuzz target, as text.
///
/// Non-UTF-8 seeds are skipped rather than lossily converted, because the
/// targets skip them too: these doors take `&str`.
fn corpus(target: &str) -> Vec<(String, String)> {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../fuzz/corpus")
        .join(target);
    let mut seeds = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the corpus directory") {
        let path = entry.expect("a corpus entry").path();
        let bytes = std::fs::read(&path).expect("a corpus file");
        if let Ok(text) = String::from_utf8(bytes) {
            let name = path.file_name().expect("a file name").to_string_lossy();
            seeds.push((name.into_owned(), text));
        }
    }
    // An empty directory would make every loop below run zero times while
    // the test still passed — the one failure mode a replay suite has.
    assert!(!seeds.is_empty(), "{target}: the corpus holds no seeds");
    seeds
}

#[test]
fn every_template_seed_parses_or_is_refused() {
    let seeds = corpus("core_template");
    assert!(seeds.len() >= 4, "the committed template seeds are missing");
    // A positive control: at least one seed must actually PARSE, or the
    // suite would be green over a corpus of nothing but garbage and would
    // never reach the code it exists to exercise.
    // Collect the names rather than a count: on failure the message has to
    // say WHICH seed, and dumping the seeds themselves would print a
    // 200-line template.
    let refused: Vec<&str> = seeds
        .iter()
        .filter(|(_, text)| parse_template(text).is_err())
        .map(|(name, _)| name.as_str())
        .collect();
    assert!(
        refused.len() < seeds.len(),
        "every template seed was refused: {refused:?}"
    );
}

#[test]
fn every_params_seed_parses_or_is_refused() {
    let seeds = corpus("core_params");
    assert!(seeds.len() >= 4, "the committed params seeds are missing");
    let mut parsed = 0;
    for (_, text) in &seeds {
        if let Ok(value) = parse_params(text) {
            parsed += 1;
            let _ = shojiku_core::resolve_path(&value, "a.b.c");
        }
    }
    assert!(parsed >= 1, "no params seed parses");
}

#[test]
fn every_definitions_seed_parses_or_is_refused() {
    let seeds = corpus("core_definitions");
    assert!(
        seeds.len() >= 3,
        "the committed definitions seeds are missing"
    );
    let mut parsed = 0;
    for (_, text) in &seeds {
        if let Ok(defs) = parse_definitions(text) {
            parsed += 1;
            let _ = Catalog::from_definitions(&defs);
        }
    }
    assert!(parsed >= 1, "no definitions seed parses");
}

#[test]
fn every_ruby_seed_scans_without_panicking() {
    let seeds = corpus("core_ruby");
    assert!(seeds.len() >= 5, "the committed ruby seeds are missing");
    // This door cannot fail — it returns segments plus warnings — so there
    // is nothing to count as "parsed". What it can do is panic on a
    // boundary, which is the whole reason it is fuzzed.
    for (_, text) in &seeds {
        let (segments, _warnings) = parse_aozora_ruby(text);
        for segment in &segments {
            let _ = format!("{segment:?}");
        }
    }
    // …and the equivalent of the other suites' positive control: at least one
    // seed must actually SEGMENT. Without this the suite passes over a
    // scanner that returned an empty vector for every input, which is
    // precisely the failure the hostile seeds exist to catch.
    let ruby = seeds
        .iter()
        .find(|(name, _)| name == "basic.txt")
        .expect("the annotated seed");
    let (segments, _) = parse_aozora_ruby(&ruby.1);
    assert!(
        segments.len() > 1,
        "the annotated seed produced no ruby segmentation: {segments:?}"
    );
}
