//! Failure modes of assembling the CMS `SignedData`.
//!
//! Bounded like every other error in this crate: names and numbers, never a
//! fragment of the certificate or the DER that failed to parse.

use thiserror::Error;

/// What went wrong while building the signature container.
#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum CmsError {
    /// The certificate file is not PEM holding a certificate.
    #[error("the certificate file is not PEM text containing a `CERTIFICATE` block")]
    CertificateNotPem,

    /// The certificate is not structurally valid X.509 DER.
    #[error("the certificate is not a structurally valid X.509 certificate")]
    CertificateMalformed,

    /// A structure could not be encoded as DER.
    ///
    /// Reachable in principle from certificate contents — an issuer name or
    /// serial number this encoder cannot re-emit — so it is a real error and
    /// not an internal invariant. Which structure failed is deliberately not
    /// recorded: every one of them is built by this crate, so the answer
    /// would name our own code rather than anything the caller can act on.
    #[error("the signature container could not be encoded")]
    Encoding,
}

impl From<der::Error> for CmsError {
    /// Every DER failure in this module means the same thing, so there is one
    /// conversion rather than a closure at each `?`.
    fn from(_: der::Error) -> Self {
        Self::Encoding
    }
}
