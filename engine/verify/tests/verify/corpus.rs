//! The fuzz corpus, replayed through the targets' public entry points.
//!
//! The two container entry points are replayed by the verify crate's own
//! unit tests; these are the three that go through a public API — the shared
//! document parser, the whole verifier, and the anchor loader — and the
//! whole-verifier one needs the generated anchors this suite already has.
//!
//! Nothing in CI builds `engine/fuzz`, so this is what keeps the corpus and
//! the targets honest between fuzzing runs, and it is where a crash the
//! fuzzer finds becomes a regression test: drop the input in the directory.

use shojiku_signing::PdfDocument;
use shojiku_verify::{verify_document, TrustAnchors};

use crate::common::anchors;

/// Every seed committed for one fuzz target.
fn corpus(target: &str) -> Vec<Vec<u8>> {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../fuzz/corpus")
        .join(target);
    let mut seeds = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the corpus directory") {
        let path = entry.expect("a corpus entry").path();
        seeds.push(std::fs::read(&path).expect("a corpus file"));
    }
    // An empty directory would make every loop below run zero times and the
    // test pass while proving nothing.
    assert!(!seeds.is_empty(), "the corpus directory holds no seeds");
    seeds
}

#[test]
fn every_pdf_document_seed_parses_or_is_refused() {
    let seeds = corpus("pdf_document");
    assert!(seeds.len() >= 3, "the committed document seeds are missing");
    for seed in seeds {
        if let Ok(document) = PdfDocument::parse(&seed) {
            let _ = document.dict_at(document.catalog_number());
        }
    }
}

#[test]
fn every_verify_document_seed_is_judged_or_refused() {
    let anchors = anchors("rsa2048");
    let seeds = corpus("verify_document");
    assert!(seeds.len() >= 2, "the committed verifier seeds are missing");
    for seed in seeds {
        // No verdict is asserted: after `make fuzz` has seeded the directory
        // one of these IS a validly signed document. What is being proven is
        // that every seed is answered rather than crashed on.
        let _ = verify_document(&seed, &anchors);
    }
}

#[test]
fn every_trust_anchor_seed_loads_or_is_refused() {
    let seeds = corpus("trust_anchors");
    assert!(seeds.len() >= 3, "the committed anchor seeds are missing");
    for seed in seeds {
        let _ = TrustAnchors::from_pem(&seed);
    }
}
