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
    // The catalog first: the table AUDIT is checked against it, so writing the
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
