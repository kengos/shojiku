//! Verification across the boundary — fail-closed, and the report that
//! survives a failing verdict.

use super::*;

#[test]
fn a_signature_this_engine_made_verifies_against_its_own_anchor() {
    let outcome = verify(&signed_receipt(), &key_bytes("rsa2048.cert.pem"));
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_OK);
    assert!(outcome.success, "error: {}", outcome.error);
    // The report names what this release did NOT check. Dropping that on the
    // way through a binding is how a missing capability becomes a promise
    // nobody made, so it must be here on a PASSING verdict too.
    assert!(outcome.json.contains("notChecked"));
}

#[test]
fn a_tampered_document_fails_closed_and_still_hands_back_the_report() {
    let pdf = rendered_receipt();
    let mut signed = signed_receipt();
    // Flip a byte inside the ORIGINAL body, not the appended revision: the
    // midpoint of the signed file lands in the part signing added, which
    // leaves a container the verifier cannot parse a signature out of at all
    // — a different outcome from the one this test exists to pin.
    signed[pdf.len() / 2] ^= 0xff;

    let outcome = verify(&signed, &key_bytes("rsa2048.cert.pem"));
    // Fail-closed: a caller who checks only `success` is not told a forgery
    // is fine.
    assert!(!outcome.success);
    assert!(outcome.error.contains("\"step\":\"verify\""));
    // And the report rides the FAILED result, because `notChecked` has to
    // reach the caller either way.
    assert!(outcome.json.contains("notChecked"));
}

#[test]
fn an_unreadable_anchor_is_a_failed_outcome_rather_than_caller_misuse() {
    let outcome = verify(&signed_receipt(), b"not a certificate");
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_OK);
    assert!(!outcome.success);
    assert!(outcome.error.contains("\"kind\":\"anchors\""));
}
