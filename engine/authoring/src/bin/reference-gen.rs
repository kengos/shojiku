//! `reference-gen` — writes the key catalog and the reference's generated
//! tables to their committed paths.
//!
//! Wiring only, on purpose. Everything that can be wrong — the audit that runs
//! before any write, and the rule that a CONTENT refusal writes nothing — lives in
//! [`shojiku_authoring::reference::run`], where a test drives it over a fixture
//! tree. That split is the point: a binary's `main` is outside every gate this
//! repo has (`required-features` keeps it out of the coverage build, and no
//! test executes it), so an ordering asserted only here is asserted by nobody.
//!
//! **This binary takes no arguments and reads no environment.** Both roots
//! below are compile-time constants built from `CARGO_MANIFEST_DIR`, so nothing
//! a caller supplies can steer where it writes. `run` accepts them as
//! parameters, which is a library signature rather than a widening of this
//! surface — and it sits behind the non-default `schema` feature, which no host
//! builds.

use shojiku_authoring::reference::run::{run, Job};
use shojiku_authoring::reference::{CATALOG_PATH, TABLES};
use std::path::Path;
use std::process::ExitCode;

/// Where the projected reference pages live, relative to this crate.
const DOCS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../docs/engine");

fn main() -> ExitCode {
    let job = Job {
        catalog: Path::new(CATALOG_PATH),
        docs: Path::new(DOCS),
        tables: TABLES,
    };
    match run(&job) {
        Ok(outcome) => {
            println!(
                "audited {} hand-written diagnostics sections: {} table code claims, {} other in-section tokens",
                outcome.sections, outcome.occurrences, outcome.checked
            );
            for path in &outcome.written {
                println!("wrote {}", path.display());
            }
            ExitCode::SUCCESS
        }
        Err(refusal) => {
            eprintln!("{refusal}");
            ExitCode::FAILURE
        }
    }
}
