//! The catalog, and the drift gate that keeps it honest.
//!
//! The gate is the point of this file. A hand-written table beside a
//! growing `examples/` tree drifts the first time someone adds an example,
//! and a catalog an agent TRUSTS is worse than no catalog at all — so the
//! table is asserted against the real directory in both directions, and
//! per entry against the files that actually exist.

use super::*;
use std::collections::BTreeSet;
use std::path::PathBuf;

/// The repo-root `examples/` tree, located the way every other test in the
/// workspace locates a fixture.
fn examples_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples")
}

/// The entries deliberately not served: site artwork generators, which
/// teach an authoring agent nothing.
const EXCLUDED: &[&str] = &["dev/site-hero", "dev/site-icon"];

/// The source files an entry may carry, in the order the catalog lists them.
const SOURCE_NAMES: &[&str] = &["templates.yml", "definitions.yml", "params.json"];

/// The largest a single embedded source file may be.
///
/// This is a BUILD-time bound, not a runtime one. `resources/read` serves a
/// named file in full — it has no way to serve half of one — so a runtime
/// refusal would just make that file unreachable. Asserting it over the
/// compiled-in corpus instead means an oversized example fails here, before
/// it can ship. Today's largest is the syntax showcase's templates.yml at
/// ~84 KiB.
const MAX_FILE_BYTES: usize = 256 * 1024;

/// Every `<bucket>/<name>` on disk that holds a `templates.yml`.
fn on_disk_entries() -> BTreeSet<String> {
    let root = examples_dir();
    let mut found = BTreeSet::new();
    for bucket in std::fs::read_dir(&root).expect("examples/ is readable") {
        let bucket = bucket.expect("bucket entry").path();
        if !bucket.is_dir() {
            continue;
        }
        for entry in std::fs::read_dir(&bucket).expect("bucket is readable") {
            let dir = entry.expect("entry").path();
            if !dir.join("templates.yml").is_file() {
                continue;
            }
            let name = |p: &PathBuf| p.file_name().expect("named").to_string_lossy().into_owned();
            found.insert(format!("{}/{}", name(&bucket), name(&dir)));
        }
    }
    found
}

#[test]
fn the_catalog_matches_the_examples_tree_exactly() {
    let on_disk = on_disk_entries();
    // Positive control: the walk found the tree at all. A gate that comes
    // back empty must fail loudly rather than pass vacuously.
    assert!(
        on_disk.len() > 20,
        "the examples walk found only {} entries — it is measuring the wrong directory",
        on_disk.len()
    );

    let expected: BTreeSet<String> = on_disk
        .iter()
        .filter(|id| !EXCLUDED.contains(&id.as_str()))
        .cloned()
        .collect();
    let listed: BTreeSet<String> = catalog().iter().map(|e| e.id.to_string()).collect();

    assert_eq!(
        listed,
        expected,
        "the embedded catalog and examples/ disagree: \
         missing from the catalog {:?}, listed but not on disk {:?}",
        expected.difference(&listed).collect::<Vec<_>>(),
        listed.difference(&expected).collect::<Vec<_>>()
    );

    // The exclusions are real entries, not typos that silently exclude
    // nothing.
    for excluded in EXCLUDED {
        assert!(
            on_disk.contains(*excluded),
            "{excluded} is excluded but does not exist"
        );
    }
}

#[test]
fn every_entry_lists_exactly_the_source_files_it_has() {
    let root = examples_dir();
    for entry in catalog() {
        let dir = root.join(entry.id);
        let expected: Vec<&str> = SOURCE_NAMES
            .iter()
            .copied()
            .filter(|name| dir.join(name).is_file())
            .collect();
        let listed: Vec<&str> = entry.files.iter().map(|f| f.name).collect();
        assert_eq!(listed, expected, "file list drifted for {}", entry.id);
    }
}

#[test]
fn every_embedded_file_matches_the_file_on_disk() {
    let root = examples_dir();
    for entry in catalog() {
        for file in entry.files {
            let disk = std::fs::read_to_string(root.join(entry.id).join(file.name))
                .expect("source file is readable");
            assert_eq!(
                file.text, disk,
                "embedded {}/{} differs from disk",
                entry.id, file.name
            );
        }
    }
}

#[test]
fn the_catalog_holds_the_expected_number_of_entries() {
    // 36 dirs carry a templates.yml; two are excluded.
    assert_eq!(catalog().len(), 34);
    assert_eq!(on_disk_entries().len(), 36);
}

#[test]
fn no_embedded_file_exceeds_the_build_time_size_bound() {
    let mut largest = 0;
    for entry in catalog() {
        for file in entry.files {
            assert!(
                file.text.len() <= MAX_FILE_BYTES,
                "{}/{} is {} bytes, over the {MAX_FILE_BYTES}-byte bound — \
                 serve it in sections or drop it from the catalog",
                entry.id,
                file.name,
                file.text.len()
            );
            largest = largest.max(file.text.len());
        }
    }
    // Positive control: the walk actually measured the corpus.
    assert!(
        largest > 80_000,
        "largest embedded file was only {largest} B"
    );
}

#[test]
fn every_entry_has_a_title_and_a_description() {
    for entry in catalog() {
        assert!(!entry.title.is_empty(), "{} has no title", entry.id);
        assert!(
            entry.description.len() > 20,
            "{} has no real description: {:?}",
            entry.id,
            entry.description
        );
        // The fallback in `describe` degrades to the id; nothing real may
        // land on it.
        assert_ne!(entry.title, entry.id, "{} fell back to its id", entry.id);
    }
}

#[test]
fn gallery_entries_take_their_prose_from_gallery_yml() {
    let invoice = find("business/invoice-ja").expect("gallery entry");
    assert_eq!(invoice.title, "Invoice (ja)");
    assert!(
        invoice.description.contains("line items"),
        "expected the gallery blurb, got {:?}",
        invoice.description
    );
}

#[test]
fn non_gallery_entries_take_their_prose_from_the_extras_table() {
    let showcase = find("dev/layout-showcase").expect("showcase entry");
    assert!(showcase.title.contains("showcase"));
    assert!(showcase.description.contains("syntax exerciser"));
}

#[test]
fn describe_degrades_to_the_id_for_an_unknown_entry() {
    // Unreachable against the real tree (the drift gate above pins that),
    // so it is proven directly.
    let (title, description) = describe("nowhere/at-all", &[]);
    assert_eq!(title, "nowhere/at-all");
    assert_eq!(description, "nowhere/at-all");
}

#[test]
fn find_answers_none_for_an_unknown_id() {
    assert!(find("business/nonexistent").is_none());
    assert!(find("dev/site-hero").is_none(), "excluded entries stay out");
}

#[test]
fn size_is_the_sum_of_the_source_files() {
    let entry = find("presets/blank-a4").expect("preset");
    let sum: usize = entry.files.iter().map(|f| f.text.len()).sum();
    assert_eq!(entry.size(), sum);
    assert_eq!(entry.files.len(), 2, "presets carry no definitions.yml");
}

#[test]
fn file_lookup_is_by_exact_name() {
    let entry = find("business/invoice-ja").expect("entry");
    assert!(entry.file("templates.yml").is_some());
    assert!(entry.file("definitions.yml").is_some());
    assert!(entry.file("output.pdf").is_none());
    assert!(entry.file("TEMPLATES.YML").is_none());
}

#[test]
fn mime_types_follow_the_extension() {
    let json = SourceFile {
        name: "params.json",
        text: "",
    };
    let yaml = SourceFile {
        name: "templates.yml",
        text: "",
    };
    let bare = SourceFile {
        name: "README",
        text: "",
    };
    assert_eq!(json.mime(), "application/json");
    assert_eq!(yaml.mime(), "application/yaml");
    assert_eq!(bare.mime(), "application/yaml");
}

#[test]
fn a_malformed_gallery_degrades_instead_of_panicking() {
    // Exercise the degrade path itself, not serde's opinion of the fixture:
    // a gallery that cannot be parsed yields no prose rather than unwinding.
    for broken in ["entries: not-a-list", "{{{", "", "other: 1"] {
        assert!(
            parse_gallery(broken).is_empty(),
            "expected no entries from {broken:?}"
        );
    }
    // Positive control: the real gallery DOES parse, so the assertion above
    // is about malformed input rather than about a parser that never works.
    assert_eq!(parse_gallery(GALLERY_YML).len(), 25);
}
