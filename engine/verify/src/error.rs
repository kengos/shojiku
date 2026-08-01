//! Failure modes of verification — the ones that mean "I cannot judge this".
//!
//! A document that verifies BADLY is not an error: it produces a
//! [`crate::VerificationReport`] whose checks say what failed. This type is
//! for the other case, where there is nothing to judge — the bytes are not a
//! readable PDF, they carry no signature, or the signature container cannot
//! be decoded at all. Keeping the two apart is what lets a caller tell "this
//! document is not trustworthy" from "I could not evaluate this document".
//!
//! Every message is a `&'static str` plus numbers, for the same structural
//! reason the signing crate gives: this parser reads attacker-chosen bytes,
//! so a variant able to hold a `String` taken from the file would be an
//! unbounded echo of hostile content into whatever logs it.

use thiserror::Error;

#[cfg(test)]
mod tests;

/// Why a document could not be evaluated.
#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum VerifyError {
    /// The bytes could not be read as a PDF this release understands.
    #[error(transparent)]
    Document(#[from] shojiku_signing::SigningError),

    /// The document carries no signature to check.
    #[error("the document carries no signature")]
    NoSignature,

    /// The signature uses a structure this release deliberately does not
    /// verify.
    #[error("unsupported signature structure: {what}")]
    Unsupported {
        /// Names the structure that was rejected.
        what: &'static str,
    },

    /// The signature is structurally broken.
    #[error("malformed signature: {what}")]
    Malformed {
        /// Names what was expected.
        what: &'static str,
    },

    /// A structural limit from [`crate::limits`] was hit.
    #[error("limit exceeded while reading the signature: {what} (cap {cap})")]
    LimitExceeded {
        /// Names the limit.
        what: &'static str,
        /// The cap that was hit.
        cap: usize,
    },

    /// No trust anchor was supplied.
    ///
    /// Verification never consults the operating system's trust store, so
    /// there is no default to fall back on: whose signatures count is the
    /// caller's decision, not the machine's.
    #[error("no trust anchor was supplied; verification needs at least one certificate to trust")]
    NoTrustAnchors,

    /// The trust-anchor input is not PEM holding certificates.
    #[error("the trust-anchor file is not PEM text containing `CERTIFICATE` blocks")]
    AnchorNotPem,
}

impl From<der::Error> for VerifyError {
    /// The catch-all for DER operations whose failure says nothing more
    /// specific than "these bytes are not the structure they claim".
    ///
    /// One conversion rather than a closure at each `?`, deliberately: a
    /// `map_err` closure per call site is a separate instantiation, and the
    /// ones on paths only a corrupt in-memory value could reach would never
    /// execute — so the coverage gate would be measuring how many
    /// unreachable closures were written rather than how much code was
    /// tested. Failures a caller can actually cause keep their own messages.
    fn from(_: der::Error) -> Self {
        Self::Malformed {
            what: "a DER structure this release can read",
        }
    }
}

/// Result alias for this crate.
pub type Result<T> = core::result::Result<T, VerifyError>;
