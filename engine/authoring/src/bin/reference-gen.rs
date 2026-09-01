//! `reference-gen` — writes the key catalog and the reference's generated
//! tables to their committed paths.
//!
//! Thin on purpose: the generation itself lives in
//! [`shojiku_authoring::reference`] so the tests can call it without running
//! a binary. `make reference:generate` runs this; the drift half is a test in
//! the DEFAULT suite, so `make engine:test` and the coverage run both hold the
//! committed files to what this would write.
//!
//! Both output paths are COMPILE-TIME constants built from
//! `CARGO_MANIFEST_DIR`: this binary takes no arguments and reads no
//! environment, so nothing a caller supplies can steer where it writes.
//!
//! It also AUDITS what it cannot write, and it does so BEFORE it writes. The
//! `## Diagnostics` sections the pages author themselves are held to this
//! build's registries by [`shojiku_authoring::reference::pages`], so a page
//! naming a diagnostic code that no longer exists stops the regeneration with
//! the tree untouched rather than surfacing after a partial rewrite.

use shojiku_authoring::reference::pages::{audit, Known};
use shojiku_authoring::reference::tables::{page, pages, parse as parse_tables, Inputs, Registry};
use shojiku_authoring::reference::{generate, CATALOG_PATH, TABLES};
use shojiku_diagnostics::DiagnosticCode;
use std::path::PathBuf;

/// Where the projected reference pages live, relative to this crate.
const DOCS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../docs/engine");

/// Every code the engine can emit, paired with the wire spelling of its
/// severity — the same word a real diagnostic carries in its JSON.
fn registry() -> Registry {
    DiagnosticCode::ALL
        .iter()
        .map(|code| {
            let severity = serde_json::to_value(code.severity())
                .ok()
                .and_then(|v| v.as_str().map(str::to_owned))
                .expect("Severity serializes as a string");
            (code.as_str().to_owned(), severity)
        })
        .collect()
}

fn main() -> std::io::Result<()> {
    // The hand-written half FIRST, before a single byte is written. An audit
    // that runs after the writes cannot refuse them: a failing run would exit
    // non-zero over a half-regenerated tree. Auditing first is safe because
    // the splice can never touch a byte this reads — no marker sits inside a
    // `## Diagnostics` section, which `no_generated_table_sits_inside_a_hand_written_section`
    // pins — and the vocabulary is compile-time regardless.
    audit_pages()?;

    // The catalog next: the table AUDIT is checked against it, so writing the
    // tables against a stale one would produce two artifacts that disagree.
    std::fs::write(CATALOG_PATH, generate())?;
    println!("wrote {CATALOG_PATH}");

    let spec = parse_tables(TABLES).expect("the committed table spec parses");
    let registry = registry();
    let inputs = Inputs {
        spec: &spec,
        registry: &registry,
    };

    for stem in pages(&spec) {
        let path = PathBuf::from(DOCS).join(format!("{stem}.md"));
        let text = std::fs::read_to_string(&path)?;
        match page(&stem, &text, &inputs) {
            Ok(next) => {
                if next != text {
                    std::fs::write(&path, next)?;
                    println!("wrote {}", path.display());
                }
            }
            Err(errors) => {
                for error in errors {
                    eprintln!("{stem}.md: {error}");
                }
                std::process::exit(1);
            }
        }
    }

    Ok(())
}

/// Holds every page's HAND-WRITTEN `## Diagnostics` section to this build's
/// registries. Called FIRST, before any write, so a page naming a diagnostic
/// code, capability key or wire word the engine does not define stops
/// `make reference:generate` with nothing written.
fn audit_pages() -> std::io::Result<()> {
    let mut paths: Vec<PathBuf> = std::fs::read_dir(DOCS)?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "md"))
        .collect();
    paths.sort();
    let mut corpus: Vec<(String, String)> = Vec::with_capacity(paths.len());
    for path in paths {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_owned();
        corpus.push((name, std::fs::read_to_string(&path)?));
    }
    let borrowed: Vec<(&str, &str)> = corpus
        .iter()
        .map(|(name, text)| (name.as_str(), text.as_str()))
        .collect();
    let known = Known::of_this_build();
    let (problems, census) = audit(&borrowed, &known.vocabulary());
    if !problems.is_empty() {
        for problem in &problems {
            eprintln!("{problem}");
        }
        std::process::exit(1);
    }
    println!(
        "audited {} hand-written diagnostics sections: {} table code claims, {} other in-section tokens",
        census.sections, census.occurrences, census.checked
    );
    Ok(())
}
