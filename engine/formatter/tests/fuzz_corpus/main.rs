//! The fuzz corpora for the formatter doors (the two pack manifests, the
//! date-pattern renderer and the bytes-first pack resolvers), replayed
//! through the same public entry points and harnesses the fuzz targets call.
//!
//! Same contract as the core suite: nothing in CI builds `engine/fuzz`, so
//! this is what keeps corpus and targets honest between on-demand runs, and
//! a seed being REFUSED is a pass. A pack is host-supplied data, so it is
//! read under the same posture as an authored document rather than trusted
//! for living on disk.

use shojiku_formatter::{LangPack, PackManifest};

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
fn every_locale_pack_seed_parses_or_is_refused() {
    let seeds = corpus("formatter_langpack");
    assert!(
        seeds.len() >= 4,
        "the committed locale-pack seeds are missing"
    );
    let mut parsed = 0;
    for text in &seeds {
        if let Ok(pack) = LangPack::from_yaml_str(text) {
            parsed += 1;
            let _ = pack.font_pack_ids();
        }
    }
    // Positive control: the shipped packs are in this corpus, so a zero here
    // means the suite is green over garbage and never reached the parser.
    assert!(parsed >= 1, "no locale-pack seed parses");
}

#[test]
fn every_font_pack_seed_parses_or_is_refused() {
    let seeds = corpus("formatter_fontpack");
    assert!(
        seeds.len() >= 4,
        "the committed font-pack seeds are missing"
    );
    let mut parsed = 0;
    for text in &seeds {
        if let Ok(manifest) = PackManifest::from_yaml(text) {
            parsed += 1;
            // Face resolution joins declared file names onto a pack dir —
            // the step a hostile manifest aims at, and the reason parsing
            // alone would not be enough here.
            let _ = manifest.face_specs("fuzz", std::path::Path::new("/nonexistent"));
        }
    }
    // Every seed except `malformed.yml` is a well-formed manifest. A seed
    // that no longer parses never calls `face_specs`, so the hostile `file`
    // path in it is never resolved; this assertion fails when one of the four
    // well-formed seeds no longer parses.
    assert!(parsed >= 4, "a well-formed font-pack seed no longer parses");
}

#[test]
fn every_date_pattern_seed_renders_within_its_bounds() {
    let seeds = corpus("formatter_pattern");
    assert!(
        seeds.len() >= 7,
        "the committed date-pattern seeds are missing"
    );
    let rendered = seeds
        .iter()
        .filter(|text| shojiku_formatter::fuzz::date_pattern(text) >= 1)
        .count();
    // Positive control: a zero means every seed stopped before the renderer.
    assert!(rendered >= 1, "no date-pattern seed renders");
}

#[test]
fn every_pack_path_seed_resolves_only_confined_faces() {
    let seeds = corpus("formatter_pack_paths");
    assert!(
        seeds.len() >= 7,
        "the committed pack-path seeds are missing"
    );
    let resolved = seeds
        .iter()
        .filter(|text| shojiku_formatter::fuzz::pack_paths(text) >= 1)
        .count();
    // Positive control: at least one seed resolves a face, so the
    // confinement assertion runs over a returned face.
    assert!(resolved >= 1, "no pack-path seed resolves a face");
}
