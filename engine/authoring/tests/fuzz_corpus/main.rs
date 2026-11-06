//! The `formatter_pack_paths` fuzz corpus, replayed through the locale-id
//! harness the fuzz target calls beside the formatter's pack-path harness.
//!
//! Nothing in CI builds `engine/fuzz`, so this replay runs every committed
//! seed through the harness assertion, and a change that breaks it fails CI
//! between on-demand fuzz runs. A seed whose first line is not a locale id
//! is a pass; an accepted id that is not one path segment is a panic.

use shojiku_authoring::fuzz::locale_id;

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
fn every_pack_path_seed_whose_first_line_is_a_locale_id_is_one_path_segment() {
    let seeds = corpus("formatter_pack_paths");
    assert!(
        seeds.len() >= 7,
        "the committed pack-path seeds are missing"
    );
    let accepted = seeds.iter().filter(|text| locale_id(text)).count();
    // Positive control: at least one seed's first line is a locale id, so
    // the path-segment assertion runs.
    assert!(accepted >= 1, "no pack-path seed starts with a locale id");
}
