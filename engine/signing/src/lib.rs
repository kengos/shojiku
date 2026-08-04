//! Signing a rendered PDF: arranging the file for a signature, and producing
//! one.
//!
//! Signing a PDF is two separable problems, and this crate keeps them
//! separable. [`prepare_sign`] arranges the document — it appends a revision
//! holding an empty signature dictionary and reports exactly which bytes the
//! eventual signature covers — and [`complete_sign`] writes a finished
//! signature into the window that was reserved. Everything in between is
//! optional: [`LocalPemSigner`] does it with a key on disk, but a caller whose
//! key lives in a smartcard or a cloud service signs the digest wherever it
//! actually is and this crate never learns that a key existed.
//!
//! Three properties shape every decision here:
//!
//! - **Append-only.** The original bytes remain a byte-identical prefix of
//!   the output. A signature covers bytes; moving one would invalidate it.
//! - **Refuse what cannot be read.** The reader handles classic
//!   cross-reference tables — what this engine produces — and rejects
//!   anything else by name (cross-reference streams, hybrid files, encrypted
//!   documents) rather than guessing. Signing a structure the writer
//!   misunderstood would produce a signature over something other than what a
//!   reader sees.
//! - **Nothing sensitive can be echoed.** No error type in this crate can
//!   hold a `String` taken from its input, so a key, a passphrase, or a
//!   fragment of a hostile file cannot reach a log line through one.
//!
//! The parser is also written to the verifier's threat model, not this
//! writer's: the same code will read attacker-chosen bytes when signature
//! verification lands, so nothing here panics on malformed input, every
//! offset is bounds-checked, every accumulation is checked arithmetic, and
//! every loop over parsed structure is capped.
//!
//! Signatures are invisible — nothing is drawn on the page — and the
//! signature itself is deterministic wherever the algorithm allows: no
//! signing-time attribute is written, so the same document signed twice with
//! the same RSA key yields the same bytes.

mod bounded;
mod cms;
mod document;
mod error;
mod key;
mod lexer;
mod limits;
mod object;
// The identifier table is public for the same reason the PDF model is: the
// verifier must recognize exactly the identifiers the signer writes, and a
// second transcription of them is a second chance to get one wrong.
pub mod oid;
mod placeholder;
mod revision;
mod sign;
mod signer;
#[cfg(test)]
mod testkit;
mod xref;

pub use cms::{CmsError, SignatureContainer};
pub use document::PdfDocument;
pub use error::{Result, SigningError};
// The shallow PDF model is public so `shojiku-verify` reads signed
// documents through THIS parser rather than one of its own: two parsers
// over the same bytes can disagree, and a disagreement means the verifier
// checked something other than what a reader sees.
pub use key::{
    KeyError, PrivateKey, SignatureAlgorithm, MAX_RSA_MODULUS_BITS, MIN_RSA_MODULUS_BITS,
};
pub use limits::{DEFAULT_CONTENTS_CAPACITY, MAX_CONTENTS_CAPACITY, MIN_CONTENTS_CAPACITY};
pub use object::{array_elements, dict_value_span, parse_ref, parse_uint, Dict, ObjRef};
pub use placeholder::{append_signature_placeholder, PlaceholderOptions, PreparedPdf};
pub use revision::{Revision, RevisionBuilder};
pub use sign::{complete_sign, prepare_sign, sign_document, PreparedSign};
pub use signer::{LocalPemSigner, PresignedSigner, Signer};

// Every error this crate can hand a caller, held to the bound the `bounded`
// module explains. One decision, checked by the compiler, rather than a rule
// each new variant has to remember.
crate::assert_errors_are_bounded!(SigningError, KeyError, CmsError);
