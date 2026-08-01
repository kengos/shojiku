//! Failure modes of the incremental-update writer.
//!
//! Every message is built from a `&'static str` plus numbers, and that is
//! structural rather than stylistic: the verifier reuses this parser on
//! attacker-chosen bytes, so a variant that could hold a `String` taken from
//! the file would be an unbounded echo of hostile content into whatever logs
//! the error. Offsets and counts locate the problem without quoting it.

use thiserror::Error;

/// What went wrong while reading or extending a PDF.
#[derive(Debug, Error, PartialEq, Eq, Clone)]
pub enum SigningError {
    /// The bytes do not begin with a `%PDF-<major>.<minor>` header.
    #[error("not a PDF: the file does not start with a %PDF- version header")]
    NotAPdf,

    /// The document uses a structure this release deliberately does not read.
    #[error("unsupported document structure: {what}")]
    Unsupported {
        /// Names the structure that was rejected.
        what: &'static str,
    },

    /// The document is structurally broken at a located byte offset.
    #[error("malformed PDF at byte offset {offset}: {what}")]
    Malformed {
        /// Byte offset the parser had reached.
        offset: usize,
        /// Names what was expected there.
        what: &'static str,
    },

    /// A parsed number does not fit, or points outside the file.
    #[error("value out of range at byte offset {offset}: {what}")]
    OutOfRange {
        /// Byte offset the value was read from.
        offset: usize,
        /// Names the value that did not fit.
        what: &'static str,
    },

    /// A structural limit from [`crate::limits`] was hit.
    #[error("limit exceeded while reading the document: {what} (cap {cap})")]
    LimitExceeded {
        /// Names the limit.
        what: &'static str,
        /// The cap that was hit.
        cap: usize,
    },

    /// A caller-supplied option is outside its documented range.
    #[error("invalid option: {what}")]
    InvalidOption {
        /// Names the option and its bounds.
        what: &'static str,
    },

    /// The finished signature does not fit the window reserved for it.
    ///
    /// The window cannot grow after the fact — every byte behind it would
    /// move, and the signature covers those bytes — so this is a request to
    /// re-prepare the document with a larger capacity, and the numbers are
    /// there to size it.
    #[error(
        "the signature is {needed} bytes but only {capacity} were reserved; \
         prepare the document again with a larger signature capacity"
    )]
    SignatureTooLarge {
        /// Size of the signature that was offered.
        needed: usize,
        /// Size the reserved window holds.
        capacity: usize,
    },

    /// Reading the private key failed.
    #[error(transparent)]
    Key(#[from] crate::key::KeyError),

    /// Building the signature container failed.
    #[error(transparent)]
    Cms(#[from] crate::cms::CmsError),
}

/// Result alias for this crate.
pub type Result<T> = core::result::Result<T, SigningError>;
