//! Verification across the boundary: the verdict, the report that travels
//! with it either way, and the refusals.
//!
//! Every document here is signed by this engine over bytes this engine
//! rendered, so the suite exercises the real round trip rather than a
//! committed fixture that could drift from what the signer now writes.

use super::*;

#[test]
fn a_document_signed_by_the_anchor_verifies_and_reports_every_check() {
    let signed = signed_receipt("rsa2048.key.pem", "rsa2048.cert.pem");
    let (status, out) = verify(&signed, &key_bytes("rsa2048.cert.pem"));

    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));

    let report: serde_json::Value =
        serde_json::from_str(&json_of(out)).expect("the report is JSON");
    assert_eq!(report["valid"], json!(true));
    for check in ["signature", "coverage", "certificateValidity", "trustChain"] {
        assert_eq!(report[check]["status"], json!("passed"), "check {check}");
    }
    // The whole point of the report: what this release did NOT look at
    // travels with a PASSING verdict, not only a failing one. A binding that
    // drops it turns a missing capability into a promise nobody made.
    assert_eq!(
        report["notChecked"],
        json!(["revocation", "timestamp"]),
        "the omissions must survive a passing verify"
    );
    assert_eq!(error_of(out), "", "a passing verdict has no error object");
    // Every operation hands back the same shape, so an SDK reads one field.
    assert_eq!(diagnostics_of(out), "{\"items\":[]}");
    free(out);
}

#[test]
fn a_leaf_certified_by_a_separate_authority_chains_to_that_authority() {
    // The self-signed cases above only prove "the signer IS the anchor". A
    // real chain needs an issuer that is not the signer.
    let signed = signed_receipt("leaf.key.pem", "leaf.cert.pem");
    let (status, out) = verify(&signed, &key_bytes("ca.cert.pem"));
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));
    free(out);
}

#[test]
fn a_tampered_document_fails_and_still_hands_back_the_whole_report() {
    let mut signed = signed_receipt("rsa2048.key.pem", "rsa2048.cert.pem");
    // The PDF version digit, at a fixed offset in the header: inside the
    // ORIGINAL revision, so the signature is what breaks, and semantically
    // harmless, so the document still PARSES. A tamper that also broke
    // parsing would prove the wrong thing — it would come back as "cannot be
    // evaluated" rather than as a failed check.
    assert!(signed.starts_with(b"%PDF-1.7"), "the header moved");
    signed[7] = b'6';

    let (status, out) = verify(&signed, &key_bytes("rsa2048.cert.pem"));
    assert_eq!(status, SHOJIKU_OK, "a bad signature is an outcome");
    assert!(!succeeded(out), "a tampered document must not verify");

    let report: serde_json::Value =
        serde_json::from_str(&json_of(out)).expect("the report rides a FAILED verdict too");
    assert_eq!(report["valid"], json!(false));
    assert_eq!(
        report["notChecked"],
        json!(["revocation", "timestamp"]),
        "the omissions must survive a failing verify"
    );

    // Precisely one check failed, and it is the one the tamper broke — the
    // four checks are separate fields so "the bytes changed" never gets
    // confused with "the chain is wrong".
    assert_eq!(report["signature"]["status"], json!("failed"));
    assert_eq!(report["coverage"]["status"], json!("passed"));
    assert_eq!(report["trustChain"]["status"], json!("passed"));

    let error = error_of(out);
    assert!(error.contains("\"step\":\"verify\""), "{error}");
    assert!(
        error.contains("\"kind\":\"signature\""),
        "the error names the check that failed: {error}"
    );
    free(out);
}

#[test]
fn an_anchor_that_signed_nothing_here_fails_the_chain_and_nothing_else() {
    let signed = signed_receipt("leaf.key.pem", "leaf.cert.pem");
    let (status, out) = verify(&signed, &key_bytes("other-ca.cert.pem"));

    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    let report: serde_json::Value = serde_json::from_str(&json_of(out)).expect("a report");
    assert_eq!(report["signature"]["status"], json!("passed"));
    assert_eq!(report["trustChain"]["status"], json!("failed"));
    assert!(
        error_of(out).contains("\"kind\":\"trust_chain\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn an_expired_certificate_fails_the_validity_check_with_the_signature_intact() {
    let signed = signed_receipt("leaf.key.pem", "leaf-expired.cert.pem");
    let (status, out) = verify(&signed, &key_bytes("ca.cert.pem"));

    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    let report: serde_json::Value = serde_json::from_str(&json_of(out)).expect("a report");
    assert_eq!(report["signature"]["status"], json!("passed"));
    assert_eq!(report["certificateValidity"]["status"], json!("failed"));
    assert!(
        error_of(out).contains("\"kind\":\"certificate_validity\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn a_document_with_no_signature_is_not_a_verdict_at_all() {
    // The distinction an SDK has to keep: "it did not verify" is a report,
    // "there is nothing to verify" is a cause with no report behind it.
    let (status, out) = verify(&rendered_receipt(), &key_bytes("rsa2048.cert.pem"));

    assert_eq!(status, SHOJIKU_OK, "an unsigned document is an outcome");
    assert!(!succeeded(out));
    assert_eq!(json_of(out), "", "there is no report to give");
    assert!(
        error_of(out).contains("\"kind\":\"document\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn bytes_that_are_not_a_pdf_are_refused_without_echoing_them() {
    let hostile = b"%PDF-1.7 \x00\x01 not-really-a-document 1234567890".to_vec();
    let (status, out) = verify(&hostile, &key_bytes("rsa2048.cert.pem"));

    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    let error = error_of(out);
    assert!(error.contains("\"step\":\"verify\""), "{error}");
    assert!(
        !error.contains("not-really-a-document"),
        "the error echoed the input: {error}"
    );
    free(out);
}

#[test]
fn anchors_that_are_not_pem_and_anchors_that_are_empty_both_say_so() {
    let signed = signed_receipt("rsa2048.key.pem", "rsa2048.cert.pem");

    let (status, out) = verify(&signed, b"-----BEGIN NONSENSE-----");
    assert_eq!(status, SHOJIKU_OK, "unusable anchors are an outcome");
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("\"kind\":\"anchors\""),
        "{}",
        error_of(out)
    );
    free(out);

    // A valid pointer with length zero: different from a null pointer, and
    // the underflow guard in the anchor decoder is what makes it safe.
    let (status, out) = verify(&signed, b"");
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("\"kind\":\"anchors\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn a_refused_call_replaces_the_out_slot_rather_than_leaving_what_was_there() {
    // An SDK's ensure/finally frees whatever the slot holds, on every path,
    // and bindings reuse one variable across calls. So a REFUSED call must
    // not leave the caller's previous handle sitting in it — freeing that
    // would be a double free the moment the binding also frees the original.
    // The frame writes the slot before any work for exactly this reason;
    // asserted at this entry point because this is the one a binding calls.
    let anchors = key_bytes("rsa2048.cert.pem");
    let (_, stale) = verify(
        &signed_receipt("rsa2048.key.pem", "rsa2048.cert.pem"),
        &anchors,
    );
    assert!(!stale.is_null(), "a live handle to leave behind");

    let mut out = stale;
    // SAFETY: the cap check rejects before the pointer is dereferenced, and
    // `out` is a local slot.
    let status = unsafe {
        shojiku_verify(
            b"%PDF".as_ptr(),
            64 * 1024 * 1024 + 1,
            anchors.as_ptr(),
            anchors.len(),
            &mut out,
        )
    };
    assert_eq!(status, SHOJIKU_ERR_TOO_LARGE);
    assert_ne!(out, stale, "the caller's previous handle must not survive");
    free(out);
    free(stale);
}
