//! The `verify` command: a signed PDF and a trust anchor in, a report out.
//!
//! Two decisions shape it.
//!
//! The trust anchor is a required flag, not an optional one with a default.
//! Verification never consults the machine's trust store, so there is
//! nothing to fall back on — and a `verify` that silently trusted whatever
//! the operating system trusts would answer a different question than the
//! one the caller asked.
//!
//! And the report is printed whether or not the document is valid, with the
//! exit code carrying the verdict. A caller that only wants a yes/no reads
//! the status; one that wants to explain the answer reads the JSON, which
//! names every check AND the ones this release does not perform.

use std::path::{Path, PathBuf};

use shojiku_verify::{verify_document, TrustAnchors, VerificationReport};

use crate::{CliError, VerifyArgs};

#[cfg(test)]
mod tests;

/// Verifies a signed document, returning its report.
///
/// # Errors
///
/// Returns [`CliError`] when an input cannot be read, when the anchors are
/// unusable, or when the document cannot be evaluated at all. A document
/// that simply fails verification is not an error here — it is a report
/// whose checks say what went wrong.
pub fn run_verify(args: &VerifyArgs) -> Result<VerificationReport, CliError> {
    let pdf = read(&args.input)?;
    let anchors = load_anchors(&args.anchor)?;
    Ok(verify_document(&pdf, &anchors)?)
}

/// Loads every `--anchor` file into one set.
///
/// Concatenated rather than parsed per file, so one flag holding a chain and
/// several flags holding one certificate each behave identically.
fn load_anchors(paths: &[PathBuf]) -> Result<TrustAnchors, CliError> {
    let mut pem = Vec::new();
    for path in paths {
        pem.extend_from_slice(&read(path)?);
        pem.push(b'\n');
    }
    Ok(TrustAnchors::from_pem(&pem)?)
}

/// Reads a whole input file.
fn read(path: &Path) -> Result<Vec<u8>, CliError> {
    std::fs::read(path).map_err(|source| CliError::Io {
        path: PathBuf::from(path),
        source,
    })
}
