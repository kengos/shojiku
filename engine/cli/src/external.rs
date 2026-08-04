//! The `sign-prepare` / `sign-complete` pair: signing without a private key.
//!
//! What separates these from `sign` is what they never touch. No key, no
//! passphrase, no prompt — the certificate and the eventual signature are both
//! public, so nothing secret is in reach of this path at all. The key stays
//! wherever it lives: a cloud KMS, an HSM, a smartcard, another service.
//!
//! **The two calls are stateless and take the same inputs.** There is no
//! prepared-document file to keep between them; `sign-complete` re-derives
//! what `sign-prepare` prepared, which is sound because appending the
//! placeholder is deterministic. Completing with a signature made over a
//! DIFFERENT document is not detected here — it produces a well-formed
//! document that fails `shojiku verify`.
//!
//! **What gets signed is the CMS signed ATTRIBUTES, not the document digest.**
//! The payload reports the digest too, for an audit log, but sending it to a
//! signer produces a document that will not verify. The two are named apart
//! for exactly that reason.

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use shojiku_signing::{
    prepare_sign, sign_document, PlaceholderOptions, PresignedSigner, SignatureAlgorithm,
    SignatureContainer,
};
use std::path::{Path, PathBuf};

use crate::args::{SignCompleteArgs, SignPrepareArgs};
use crate::CliError;

#[cfg(test)]
mod tests;

/// What a signature has to be computed over, and what it will be written into.
///
/// The key names are the C ABI's, unchanged — five SDKs already read them off
/// `shojiku_sign_prepare`, and the two that script this binary must land on
/// the same object rather than a second vocabulary. That is the same rule the
/// `--report` envelope follows for `pageCount` and for its failure object.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prepared {
    /// The CMS signed attributes, base64. THIS is what a key signs.
    to_be_signed: String,
    /// The document's own SHA-256, base64. Offered for an audit trail; it is
    /// NOT what gets signed, so do not send it to a signer by mistake.
    digest: String,
    /// The two ranges the signature will cover.
    byte_range: [usize; 4],
    /// How many signature bytes the reserved window can hold.
    capacity: usize,
}

/// `shojiku sign-prepare`: reserve the window and report what to sign.
///
/// # Errors
///
/// Returns [`CliError`] when an input cannot be read, when the algorithm is
/// not one this release writes, or when the document cannot be prepared.
pub fn run_sign_prepare(args: &SignPrepareArgs) -> Result<Prepared, CliError> {
    let pdf = read(&args.input)?;
    let certificate = read(&args.cert)?;
    let algorithm = parse_algorithm(&args.algorithm)?;
    let prepared = prepare_sign(&pdf, &PlaceholderOptions::default())?;
    // Built through the certificate's own rejection path: reading the
    // certificate can fail on anything a caller supplies, while encoding
    // attributes from a fixed-width digest cannot fail at all.
    let container = SignatureContainer::new(&certificate, prepared.digest(), algorithm)?;
    let to_be_signed = container.to_be_signed()?;
    Ok(Prepared {
        to_be_signed: STANDARD.encode(&to_be_signed),
        digest: STANDARD.encode(prepared.digest()),
        byte_range: prepared.byte_range(),
        capacity: prepared.capacity(),
    })
}

/// `shojiku sign-complete`: write a signature made elsewhere into the
/// document, returning the signed bytes.
///
/// # Errors
///
/// Returns [`CliError`] when an input cannot be read, when the algorithm is
/// not one this release writes, when the signature is empty, or when the
/// document cannot be signed.
pub fn run_sign_complete(args: &SignCompleteArgs) -> Result<Vec<u8>, CliError> {
    let pdf = read(&args.input)?;
    let certificate = read(&args.cert)?;
    let algorithm = parse_algorithm(&args.algorithm)?;
    let signature = read(&args.signature)?;
    require_signature(&signature)?;
    // The SAME call the local-key path makes. The external route differs only
    // in where the signature came from, so the container, the window and its
    // size check cannot drift from the shipped ones.
    let signer = PresignedSigner::new(algorithm, &certificate, &signature);
    Ok(sign_document(
        &pdf,
        &signer,
        &PlaceholderOptions::default(),
    )?)
}

/// The algorithm the caller named.
///
/// The SPELLINGS belong to the algorithm itself (`shojiku-signing`), because
/// the C ABI takes an algorithm by name too and two transcriptions of one wire
/// are two chances to disagree. What belongs here is the refusal, and it names
/// what IS accepted rather than echoing back a string this binary was handed.
fn parse_algorithm(name: &str) -> Result<SignatureAlgorithm, CliError> {
    SignatureAlgorithm::from_wire(name).ok_or(CliError::Algorithm)
}

/// An empty signature is refused rather than written.
///
/// It would produce a well-formed container that fails verification — a
/// document that looks signed and is not, which is the one outcome a signing
/// surface must never produce quietly.
fn require_signature(signature: &[u8]) -> Result<(), CliError> {
    if signature.is_empty() {
        return Err(CliError::EmptySignature);
    }
    Ok(())
}

/// Reads a whole input file.
fn read(path: &Path) -> Result<Vec<u8>, CliError> {
    std::fs::read(path).map_err(|source| CliError::Io {
        path: PathBuf::from(path),
        source,
    })
}
