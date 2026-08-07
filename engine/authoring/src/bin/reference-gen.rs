//! `reference-gen` — writes the key catalog to its committed path.
//!
//! Thin on purpose: the generation itself lives in
//! [`shojiku_authoring::reference`] so the tests can call it without running
//! a binary. `make reference-data` runs this; `make reference-check`
//! regenerates in memory and fails on any difference from what is committed.
//!
//! The output path is a COMPILE-TIME constant built from
//! `CARGO_MANIFEST_DIR`: this binary takes no arguments and reads no
//! environment, so nothing a caller supplies can steer where it writes.

use shojiku_authoring::reference::{generate, CATALOG_PATH};

fn main() -> std::io::Result<()> {
    std::fs::write(CATALOG_PATH, generate())?;
    println!("wrote {CATALOG_PATH}");
    Ok(())
}
