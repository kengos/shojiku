//! Signing in two calls, driven the way a KMS-backed SDK drives it.
//!
//! The stand-in for the cloud service is a key loaded in this test process:
//! what matters is that the LIBRARY never sees it, and it does not — the only
//! things crossing the boundary are the document, the public certificate, an
//! algorithm name, and a finished signature. That is the same shape a real
//! service has, without a network in the gate.
//!
//! The round trips and the promises they pin live here; the refusals are the
//! sibling module.

mod refusals;

use super::*;
use shojiku_signing::PrivateKey;

pub(super) const RSA: &[u8] = b"rsa-pkcs1-sha256";
pub(super) const ECDSA: &[u8] = b"ecdsa-p256-sha256";

/// What `shojiku_sign_prepare` reported.
pub(super) struct Prepared {
    pub(super) to_be_signed: Vec<u8>,
    pub(super) digest: Vec<u8>,
    pub(super) byte_range: Vec<u64>,
    pub(super) capacity: u64,
}

/// Prepares a document, asserting the call succeeded, and decodes the payload
/// exactly as a binding would.
pub(super) fn prepared(pdf: &[u8], certificate: &[u8], algorithm: &[u8]) -> Prepared {
    let (status, out) = sign_prepare(pdf, certificate, algorithm);
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));
    let payload: serde_json::Value =
        serde_json::from_str(&json_of(out)).expect("the payload is JSON");
    // Every operation hands back the same shape, so an SDK reads one field.
    assert_eq!(diagnostics_of(out), "{\"items\":[]}");
    // A prepare produced no document, so there are no PDF bytes to read.
    assert!(buffer(shojiku_result_pdf, out).is_empty());
    free(out);
    Prepared {
        to_be_signed: decode(&payload, "toBeSigned"),
        digest: decode(&payload, "digest"),
        byte_range: payload["byteRange"]
            .as_array()
            .expect("byteRange is an array")
            .iter()
            .map(|value| value.as_u64().expect("a byte-range offset"))
            .collect(),
        capacity: payload["capacity"].as_u64().expect("a capacity"),
    }
}

fn decode(payload: &serde_json::Value, key: &str) -> Vec<u8> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine as _;
    STANDARD
        .decode(payload[key].as_str().expect("a base64 string"))
        .expect("valid base64")
}

/// The stand-in for the service that holds the key: it signs the bytes it is
/// handed and knows nothing else about the document.
pub(super) fn sign_elsewhere(key: &str, message: &[u8]) -> Vec<u8> {
    PrivateKey::from_pem(&key_bytes(key), None)
        .expect("the test key loads")
        .sign(message)
        .expect("the test key signs")
}

/// The whole two-step round trip, ending in signed bytes.
fn round_trip(key: &str, certificate: &str, algorithm: &[u8]) -> Vec<u8> {
    let pdf = rendered_receipt();
    let certificate = key_bytes(certificate);
    let prepared = prepared(&pdf, &certificate, algorithm);
    let signature = sign_elsewhere(key, &prepared.to_be_signed);

    let (status, out) = sign_complete(&pdf, &certificate, algorithm, &signature);
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));
    // The completing half produced a DOCUMENT, not a payload — the mirror of
    // the prepare half, which produces a payload and no document. One field
    // per operation is what lets a binding read the same slot every time.
    assert!(buffer(shojiku_result_json, out).is_empty());
    assert_eq!(diagnostics_of(out), "{\"items\":[]}");
    let signed = buffer(shojiku_result_pdf, out);
    free(out);
    signed
}

/// Asserts a document verifies against `anchor`.
fn verifies(signed: &[u8], anchor: &str) -> bool {
    let (status, out) = verify(signed, &key_bytes(anchor));
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    let verdict = succeeded(out);
    free(out);
    verdict
}

#[test]
fn an_rsa_key_held_outside_this_library_produces_a_document_that_verifies() {
    let signed = round_trip("rsa2048.key.pem", "rsa2048.cert.pem", RSA);
    assert!(verifies(&signed, "rsa2048.cert.pem"));
}

#[test]
fn an_ecdsa_key_held_outside_this_library_produces_a_document_that_verifies() {
    let signed = round_trip("ec256.key.pem", "ec256.cert.pem", ECDSA);
    assert!(verifies(&signed, "ec256.cert.pem"));
}

#[test]
fn a_leaf_signed_this_way_still_chains_to_the_authority_that_issued_it() {
    // The self-signed cases prove "the signer IS the anchor" and nothing
    // more; a KMS-held key in production is almost always a leaf.
    let signed = round_trip("leaf.key.pem", "leaf.cert.pem", RSA);
    assert!(verifies(&signed, "ca.cert.pem"));
}

#[test]
fn the_two_step_path_writes_the_same_bytes_the_one_shot_path_does() {
    // The claim this pins is that the external route did not FORK the local
    // one — it reaches the same container, window and size check through the
    // same call. It is also what makes the pair stateless: completing
    // re-prepares the document, and only a deterministic prepare makes that
    // sound. RSA PKCS#1 v1.5 is deterministic, so the signatures match too.
    let two_step = round_trip("rsa2048.key.pem", "rsa2048.cert.pem", RSA);
    let one_shot = signed_receipt("rsa2048.key.pem", "rsa2048.cert.pem");
    assert_eq!(two_step, one_shot, "the two signing paths diverged");
}

#[test]
fn preparing_the_same_document_twice_reports_the_same_thing() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    let first = prepared(&pdf, &certificate, RSA);
    let second = prepared(&pdf, &certificate, RSA);

    assert_eq!(first.to_be_signed, second.to_be_signed);
    assert_eq!(first.digest, second.digest);
    assert_eq!(first.byte_range, second.byte_range);
    assert_eq!(first.capacity, second.capacity);
    // The digest is the document's own SHA-256, which the header offers for
    // audit logging and warns is NOT what gets signed. Pin both facts, since
    // a caller that confused them would sign the wrong bytes.
    assert_eq!(first.digest.len(), 32);
    assert_ne!(first.digest, first.to_be_signed);
    assert_eq!(first.byte_range.len(), 4);
    assert!(first.capacity > 0);
}

#[test]
fn a_signature_made_over_another_document_yields_one_that_fails_verification() {
    // The header states this is not detected at the boundary. It must
    // therefore be detected where it matters, and never pass quietly.
    let mine = rendered_receipt();
    let other = {
        let (status, out) = call(shojiku_render, &multi_page_request());
        assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
        let pdf = buffer(shojiku_result_pdf, out);
        free(out);
        pdf
    };
    let certificate = key_bytes("rsa2048.cert.pem");
    let wrong = prepared(&other, &certificate, RSA);
    let signature = sign_elsewhere("rsa2048.key.pem", &wrong.to_be_signed);

    let (status, out) = sign_complete(&mine, &certificate, RSA, &signature);
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "a well-formed document is still produced");
    let signed = buffer(shojiku_result_pdf, out);
    free(out);

    assert!(
        !verifies(&signed, "rsa2048.cert.pem"),
        "a mismatched signature must not verify"
    );
}

#[test]
fn a_document_signed_this_way_still_fails_verification_once_a_byte_is_flipped() {
    // Indexed from the ORIGINAL body: signing APPENDS, so the midpoint of the
    // finished file lands in the appended revision and would leave nothing to
    // parse a signature out of — a different outcome than the one this pins.
    let original_len = rendered_receipt().len();
    let mut signed = round_trip("rsa2048.key.pem", "rsa2048.cert.pem", RSA);
    signed[original_len / 2] ^= 0xff;

    assert!(
        !verifies(&signed, "rsa2048.cert.pem"),
        "a tampered document must not verify"
    );
}
