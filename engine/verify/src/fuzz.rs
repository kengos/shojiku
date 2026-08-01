//! The DER-side parsers, reachable directly for the fuzz targets.
//!
//! `verify_document` reaches the container parsers only through a
//! structurally valid PDF whose signature dictionary points at a well-formed
//! window — which a byte-mutating fuzzer essentially never builds. Fuzzing
//! only the front door would therefore leave the DER half untested no matter
//! how long it ran, so these two functions hand a fuzzer the same parsers the
//! verifier uses, with nothing between it and them.
//!
//! Doc-hidden `pub` rather than feature-gated, deliberately: a
//! `#[cfg(feature = "…")]` entry point is invisible to `cargo llvm-cov`
//! (which builds default features) while `clippy --all-features` still
//! compiles it — shipped code the coverage gate never sees. Plain `pub`
//! keeps it inside the gate, and the corpus replay tests in `tests` cover it
//! with the same inputs the fuzzer starts from.
//!
//! Nothing here is API: the module is hidden, both functions return `()` on
//! success, and callers outside `engine/fuzz` have no reason to exist.

use crate::container;
use crate::container::window;
use crate::error::Result;

#[cfg(test)]
mod tests;

/// Decodes a `/Contents` hexadecimal window given the window bytes alone.
///
/// The verifier passes a document plus the span the structural walk found;
/// a fuzzer has no document, so the input IS the window — brackets, digits
/// and all.
///
/// # Errors
///
/// Returns [`crate::VerifyError`] when the bytes are not a bracketed
/// even-length run of hexadecimal digits within the size cap.
pub fn decode_contents_window(window_bytes: &[u8]) -> Result<()> {
    window::decode_window(window_bytes, &(0..window_bytes.len())).map(|_| ())
}

/// Decodes a CMS `SignedData` container from raw DER.
///
/// # Errors
///
/// Returns [`crate::VerifyError`] when the bytes are not one decodable
/// `SignedData` carrying exactly one signer this release can read.
pub fn decode_container(der: &[u8]) -> Result<()> {
    container::parse(der).map(|_| ())
}
