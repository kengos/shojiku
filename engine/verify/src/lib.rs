//! Verifying a signed PDF: does the signature hold, and does it cover the
//! document you are looking at?
//!
//! The second question is the one that makes this crate worth having.
//! Because a PDF admits appended revisions, a file can carry a
//! cryptographically perfect signature that covers only its original bytes
//! while a later revision changes what a reader sees — so checking the
//! signature is not enough, and a verifier that stops there reports "valid"
//! on an altered document. [`VerificationReport::coverage`] is that second
//! check, reported separately so the two failures never get confused.
//!
//! Four properties shape everything here:
//!
//! - **The report says what it did NOT check.** Revocation and timestamps
//!   are not verified in this release, and that appears in the output of a
//!   PASSING verification, not only a failing one. A valid verdict that
//!   quietly skipped revocation converts a missing capability into a false
//!   assurance.
//! - **Trust is the caller's.** The operating system's trust store is never
//!   consulted; anchors are supplied per call.
//! - **Every byte read is attacker-chosen.** Nothing panics on malformed
//!   input, every offset is bounds-checked, every accumulation is checked
//!   arithmetic, and every loop over parsed structure is capped in
//!   `limits`. No error can hold a fragment of the file.
//! - **One parser, shared with the signer.** The document is read through
//!   `shojiku-signing`'s model rather than a second one written here: two
//!   parsers over the same bytes can disagree, and a disagreement means the
//!   verifier checked something other than what a reader sees.
//!
//! This crate is host-side. It opens no socket and is not part of the WASM
//! build, so the Designer renders in the browser but does not verify there.

mod chain;
mod container;
mod error;
// Entry points for the out-of-tree fuzz targets in `engine/fuzz`; hidden
// rather than feature-gated so the coverage gate still sees them.
#[doc(hidden)]
pub mod fuzz;
mod limits;
mod locate;
mod range;
mod report;
mod signature;
#[cfg(test)]
mod testkit;
#[cfg(test)]
mod tests;

use std::time::{SystemTime, UNIX_EPOCH};

use shojiku_signing::PdfDocument;

pub use chain::TrustAnchors;
pub use error::{Result, VerifyError};
pub use report::{CheckOutcome, NotChecked, VerificationReport};

// The same bound the signing crate holds its errors to, applied to this
// crate's from the one macro that states the decision — including
// `CheckOutcome`, which is the other channel a document's contents could
// reach a log through.
shojiku_signing::assert_errors_are_bounded!(VerifyError, CheckOutcome);

/// Verifies the signature on `pdf` against `anchors`, as of now.
///
/// # Errors
///
/// Returns [`VerifyError`] when the document cannot be EVALUATED — it is not
/// a readable PDF, carries no signature, or its container cannot be decoded.
/// A document that verifies badly is not an error: it returns a report whose
/// checks name what failed.
pub fn verify_document(pdf: &[u8], anchors: &TrustAnchors) -> Result<VerificationReport> {
    verify_document_at(pdf, anchors, now_unix_seconds())
}

/// Verifies the signature on `pdf` as of `at_unix_seconds`.
///
/// The time is explicit because certificate validity is inherently
/// time-dependent, and a verdict that silently depends on when it ran is not
/// reproducible. [`verify_document`] is this function with the system clock.
///
/// # Errors
///
/// As [`verify_document`].
pub fn verify_document_at(
    pdf: &[u8],
    anchors: &TrustAnchors,
    at_unix_seconds: u64,
) -> Result<VerificationReport> {
    let document = PdfDocument::parse(pdf)?;
    let located = locate::locate(pdf, &document)?;
    let container = container::parse(&container::decode_window(pdf, &located.contents)?)?;
    let byte_range = range::parse_byte_range(&located.dict)?;

    let coverage = range::check_coverage(byte_range, &located.contents, pdf.len());
    let signature = match range::covered_bytes(pdf, byte_range) {
        Some(covered) => signature::check(&container, &covered),
        None => CheckOutcome::failed("the signed ranges do not lie inside the document"),
    };
    let (certificate_validity, trust_chain) = chain::check(
        &container.certificate,
        &container.others,
        anchors,
        at_unix_seconds,
    );
    Ok(VerificationReport::new(
        signature,
        coverage,
        certificate_validity,
        trust_chain,
    ))
}

/// The current time as seconds since the Unix epoch.
///
/// A clock set before the epoch degrades to zero, which makes every
/// certificate "not yet valid" — conservative, and the only safe direction
/// to fail in.
fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}
