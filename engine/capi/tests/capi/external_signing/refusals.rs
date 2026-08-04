//! What the two-call signing surface refuses, and how it says so.
//!
//! Two levels are on show and they are not the same thing: a caller who
//! passed something the surface cannot accept gets a NON-ZERO status, while a
//! document or certificate the engine will not work with is an ordinary
//! outcome — status zero, `success` zero, an error object saying why.

use super::{ECDSA, RSA};
use crate::*;

/// The three pointer arguments `prepare` requires, and the fourth `complete`
/// adds — as raw pairs, so one of them can be nulled at a time.
type Pair = (*const u8, usize);

fn pair(bytes: &[u8]) -> Pair {
    (bytes.as_ptr(), bytes.len())
}

const NULL: Pair = (std::ptr::null(), 4);

#[test]
fn an_unsupported_algorithm_is_refused_by_both_calls_without_echoing_it() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    for (label, (status, out)) in [
        (
            "prepare",
            sign_prepare(&pdf, &certificate, b"ecdsa-p521-sha512"),
        ),
        (
            "complete",
            sign_complete(&pdf, &certificate, b"ecdsa-p521-sha512", b"\x30\x00"),
        ),
    ] {
        assert_eq!(status, SHOJIKU_ERR_INVALID_REQUEST, "{label}");
        let error = error_of(out);
        // The refusal names what IS accepted; the rejected value is the
        // caller's own text and this surface's errors end up in someone
        // else's logs.
        assert!(error.contains("rsa-pkcs1-sha256"), "{label}: {error}");
        assert!(error.contains("ecdsa-p256-sha256"), "{label}: {error}");
        assert!(!error.contains("p521"), "{label}: {error}");
        free(out);
    }
}

#[test]
fn both_accepted_algorithm_spellings_reach_a_prepared_document() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    for algorithm in [RSA, ECDSA] {
        let (status, out) = sign_prepare(&pdf, &certificate, algorithm);
        assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
        assert!(succeeded(out), "error: {}", error_of(out));
        free(out);
    }
}

#[test]
fn an_algorithm_that_is_not_utf8_is_named_rather_than_panicking() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    let (status, out) = sign_prepare(&pdf, &certificate, &[0xff, 0xfe, 0xfd]);
    assert_eq!(status, SHOJIKU_ERR_INVALID_UTF8);
    assert!(error_of(out).contains("algorithm"), "{}", error_of(out));
    free(out);
}

#[test]
fn an_empty_signature_is_refused_rather_than_written_into_the_window() {
    // It would produce a well-formed container that fails verification: a
    // document that looks signed and is not.
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    let (status, out) = sign_complete(&pdf, &certificate, RSA, b"");
    assert_eq!(status, SHOJIKU_ERR_INVALID_REQUEST);
    assert!(error_of(out).contains("signature"), "{}", error_of(out));
    free(out);
}

#[test]
fn a_signature_past_the_cap_is_refused_before_the_document_is_touched() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    let oversized = vec![0x41; 8 * 1024 + 1];
    let (status, out) = sign_complete(&pdf, &certificate, RSA, &oversized);
    assert_eq!(status, SHOJIKU_ERR_TOO_LARGE);
    let error = error_of(out);
    assert!(
        error.contains("too_large") && error.contains("signature"),
        "{error}"
    );
    free(out);
}

#[test]
fn a_signature_that_does_not_fit_the_window_fails_as_an_outcome_not_a_document() {
    // Under the argument cap, but the container adds the certificate and the
    // signed attributes on top — so this is the signing crate's own size
    // check, which exists because the buffer continues past the window and an
    // overlong container would otherwise corrupt the document silently.
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    let just_under_the_cap = vec![0x41; 8 * 1024];
    let (status, out) = sign_complete(&pdf, &certificate, RSA, &just_under_the_cap);
    assert_eq!(status, SHOJIKU_OK, "an unfittable signature is an outcome");
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("\"kind\":\"signing\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn a_certificate_that_is_not_pem_is_refused_by_prepare_before_any_round_trip() {
    // Which is why `prepare` takes the certificate at all: the caller learns
    // the material is unusable before paying a service to sign anything.
    let pdf = rendered_receipt();
    let (status, out) = sign_prepare(&pdf, b"-----BEGIN NONSENSE-----", RSA);
    assert_eq!(status, SHOJIKU_OK, "an unusable certificate is an outcome");
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("\"kind\":\"certificate\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn preparing_something_that_is_not_a_pdf_is_refused_by_the_signer() {
    let (status, out) = sign_prepare(
        b"this is not a PDF at all",
        &key_bytes("rsa2048.cert.pem"),
        RSA,
    );
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("\"kind\":\"signing\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn nulling_any_one_required_pointer_is_refused_by_name() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    let (doc, cert, alg) = (pair(&pdf), pair(&certificate), pair(RSA));
    let mut out: *mut ShojikuResult = std::ptr::null_mut();

    // One null per row, so a check that covered only the first argument would
    // show up here rather than hide behind it.
    for (label, prepare) in [
        ("pdf", [NULL, cert, alg]),
        ("certificate", [doc, NULL, alg]),
        ("algorithm", [doc, cert, NULL]),
    ] {
        let [a, b, c] = prepare;
        // SAFETY: exactly one pointer is null — the case under test; the
        // others are live buffers and `out` is a local slot.
        let status = unsafe { shojiku_sign_prepare(a.0, a.1, b.0, b.1, c.0, c.1, &mut out) };
        assert_eq!(status, SHOJIKU_ERR_NULL_ARG, "prepare/{label}");
        free(out);
    }

    // SAFETY: only the signature is null; the rest are live buffers.
    let status = unsafe {
        shojiku_sign_complete(
            doc.0, doc.1, cert.0, cert.1, alg.0, alg.1, NULL.0, NULL.1, &mut out,
        )
    };
    assert_eq!(status, SHOJIKU_ERR_NULL_ARG, "complete/signature");
    free(out);
}

#[test]
fn a_null_result_slot_is_answered_without_writing_anywhere() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");
    let signature = [0x30u8, 0x00];
    // SAFETY: every buffer is live; `out` is deliberately null, which is the
    // case under test.
    let status = unsafe {
        shojiku_sign_complete(
            pdf.as_ptr(),
            pdf.len(),
            certificate.as_ptr(),
            certificate.len(),
            RSA.as_ptr(),
            RSA.len(),
            signature.as_ptr(),
            signature.len(),
            std::ptr::null_mut(),
        )
    };
    assert_eq!(status, SHOJIKU_ERR_NULL_ARG);
}
