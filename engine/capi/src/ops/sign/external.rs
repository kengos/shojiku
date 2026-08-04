//! Signing in two calls, for a key this process must never hold.
//!
//! `prepare` hands out the bytes a signature has to be computed over;
//! `complete` takes the finished signature back and writes the document. In
//! between, the caller does whatever producing a signature requires — a cloud
//! KMS, an HSM, a smartcard — and this library learns nothing about it. That
//! is the whole point: the private key stays wherever it lives.
//!
//! **The two calls are stateless and take the same inputs.** There is no
//! prepared-document handle, because this library has exactly one allocation
//! that crosses the boundary and one destructor for it; a second kind would
//! be a second ownership rule in seven SDKs. `complete` re-derives the
//! prepared document by preparing it again, which is sound because appending
//! the signature placeholder is deterministic — the trailer's `/ID` is
//! carried through unchanged and the container carries no `signingTime`, so
//! the same document yields the same bytes and the same digest every time.
//! It also means the digest inside the container is always the digest of the
//! bytes actually being written; a caller cannot supply one that disagrees.
//!
//! Nothing secret crosses here in either direction. The certificate is public
//! and so is the signature — the material that must not leak never enters
//! this process at all, which is what makes this surface different from
//! [`super::run`].

use crate::result::ShojikuResult;
use crate::status::{encode, Failure};
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use shojiku_diagnostics::Diagnostics;
use shojiku_signing::{
    prepare_sign, sign_document, CmsError, PlaceholderOptions, PresignedSigner, SignatureAlgorithm,
    SignatureContainer,
};

/// Longest signature this library accepts.
///
/// It is the reserved window's own size: the finished container holds the
/// signature plus the certificate and the signed attributes, so anything
/// longer than the whole window cannot fit any container and is caller error
/// rather than a document outcome. A signature just UNDER it still overflows
/// once the rest of the container is added, and that stays the signing
/// crate's own size check.
pub(crate) const MAX_SIGNATURE_BYTES: usize = shojiku_signing::DEFAULT_CONTENTS_CAPACITY;

#[cfg(test)]
mod tests;

/// Reserves the signature window and reports what has to be signed.
///
/// Takes the same arguments `complete` does, which is deliberate: the rule a
/// caller has to follow is "give both calls the same inputs", and a rule is
/// easier to keep when the two signatures match. Neither the certificate nor
/// the algorithm changes what gets signed — the signed attributes are built
/// from the document digest alone — but checking both HERE means an
/// unreadable certificate or an unsupported algorithm fails before the caller
/// pays for a round trip to wherever the key lives.
pub(crate) fn prepare(
    pdf: &[u8],
    certificate: &[u8],
    algorithm: &str,
) -> Result<ShojikuResult, Failure> {
    let algorithm = parse_algorithm(algorithm)?;
    let prepared = prepare_sign(pdf, &PlaceholderOptions::default())
        .map_err(|err| Failure::host("sign", "signing", &err))?;
    let to_be_signed = attributes_to_sign(certificate, prepared.digest(), algorithm)
        .map_err(|err| Failure::host("sign", "certificate", &err))?;
    let payload = serde_json::json!({
        "toBeSigned": STANDARD.encode(&to_be_signed),
        "digest": STANDARD.encode(prepared.digest()),
        "byteRange": prepared.byte_range(),
        "capacity": prepared.capacity(),
    });
    // The empty diagnostics list keeps every operation's result one shape.
    Ok(ShojikuResult::json_and_diagnostics(
        payload.to_string(),
        encode(&Diagnostics::new()),
    ))
}

/// Writes a signature produced elsewhere into the document.
pub(crate) fn complete(
    pdf: &[u8],
    certificate: &[u8],
    algorithm: &str,
    signature: &[u8],
) -> Result<ShojikuResult, Failure> {
    let signer = PresignedSigner::new(
        parse_algorithm(algorithm)?,
        certificate,
        require_signature(signature)?,
    );
    // Deliberately the SAME call the one-shot path makes. The external route
    // differs only in where the signature came from, so it cannot drift from
    // the local one: the container, the algorithm identifier, the window and
    // its size check are all the shipped ones.
    let signed = sign_document(pdf, &signer, &PlaceholderOptions::default())
        .map_err(|err| Failure::host("sign", "signing", &err))?;
    Ok(ShojikuResult::pdf(signed, encode(&Diagnostics::new())))
}

/// The bytes a signature must cover: the CMS signed attributes, which carry
/// the document digest.
///
/// Built through ONE rejection path deliberately. Reading the certificate can
/// fail on any input a caller supplies; encoding attributes built from a
/// fixed-width digest cannot fail at all, so giving it a rejection of its own
/// would mint a branch no test can reach — and an unreachable branch here is
/// a line the coverage gate reds rather than a safety net.
fn attributes_to_sign(
    certificate: &[u8],
    digest: &[u8; 32],
    algorithm: SignatureAlgorithm,
) -> Result<Vec<u8>, CmsError> {
    SignatureContainer::new(certificate, digest, algorithm)?.to_be_signed()
}

/// This host's refusal for a name no algorithm answers to.
///
/// The SPELLINGS live with the algorithm enum in `shojiku-signing`, because
/// the CLI takes an algorithm by name too and two transcriptions of one wire
/// are two chances to disagree. What stays here is the refusal: a `Failure`
/// this host can classify, whose message names what IS accepted rather than
/// echoing the caller's string back.
pub(crate) fn parse_algorithm(algorithm: &str) -> Result<SignatureAlgorithm, Failure> {
    SignatureAlgorithm::from_wire(algorithm).ok_or_else(|| {
        Failure::InvalidRequest(
            "`algorithm` must be \"rsa-pkcs1-sha256\" or \"ecdsa-p256-sha256\"".into(),
        )
    })
}

/// An empty signature is refused rather than written.
///
/// It would produce a well-formed container that fails verification — a
/// document that looks signed and is not, which is the one outcome a signing
/// surface must never produce quietly.
pub(crate) fn require_signature(signature: &[u8]) -> Result<&[u8], Failure> {
    if signature.is_empty() {
        return Err(Failure::InvalidRequest(
            "`signature` is empty; there is nothing to write into the document".into(),
        ));
    }
    Ok(signature)
}
