//! Malformed and crafted documents: structured failure, never a panic.

use shojiku_verify::{verify_document, TrustAnchors, VerifyError};

use crate::common::{anchors, bundled_examples, example, find, layout, sign};

/// Whether an outcome is a structured refusal or an explicitly invalid
/// verdict — anything except a crash or a claim of validity.
fn refused(outcome: Result<shojiku_verify::VerificationReport, VerifyError>) -> bool {
    match outcome {
        Err(_) => true,
        Ok(report) => !report.is_valid(),
    }
}

#[test]
fn every_truncation_of_a_signed_example_is_refused_without_panicking() {
    let signed = sign(&bundled_examples().remove(0).1, "rsa2048");
    let anchors = anchors("rsa2048");
    // Sampled rather than exhaustive — a real example is tens of kilobytes —
    // but sampled across the WHOLE file, so every structure it holds gets
    // cut somewhere.
    for cut in (0..signed.len()).step_by(97) {
        assert!(
            refused(verify_document(&signed[..cut], &anchors)),
            "a document cut at {cut} bytes was reported valid"
        );
    }
}

#[test]
fn an_unsigned_example_carries_nothing_to_evaluate() {
    for (name, pdf) in bundled_examples() {
        assert_eq!(
            verify_document(&pdf, &anchors("rsa2048")),
            Err(VerifyError::NoSignature),
            "{name}"
        );
    }
}

#[test]
fn a_byte_range_pointing_past_the_end_of_the_file_is_refused() {
    let mut signed = sign(&bundled_examples().remove(0).1, "rsa2048");
    let marker = b"/ByteRange [";
    let at = find(&signed, marker).expect("a range array") + marker.len();
    // The widest value the fixed-width field holds — ten digits in, ten
    // digits out, so no byte after it moves.
    signed[at + 33..at + 43].copy_from_slice(b"9999999999");
    let report = verify_document(&signed, &anchors("rsa2048")).expect("evaluates");
    assert!(!report.is_valid());
    assert!(!report.coverage().is_passed());
}

#[test]
fn a_byte_range_whose_fields_overlap_is_refused() {
    let mut signed = sign(&bundled_examples().remove(0).1, "rsa2048");
    let marker = b"/ByteRange [";
    let at = find(&signed, marker).expect("a range array") + marker.len();
    // Make the second range start back inside the first: the two claims
    // overlap, so they cannot both be describing what was signed.
    signed[at + 22..at + 32].copy_from_slice(b"0000000010");
    let report = verify_document(&signed, &anchors("rsa2048")).expect("evaluates");
    assert!(!report.is_valid());
    assert!(!report.coverage().is_passed());
}

#[test]
fn a_signature_window_holding_something_other_than_der_is_refused() {
    let mut signed = sign(&bundled_examples().remove(0).1, "rsa2048");
    let window = layout(&signed).window;
    // Every digit a zero: still a well-formed hexadecimal string, and not a
    // container.
    for slot in &mut signed[window.start..window.end] {
        *slot = b'0';
    }
    assert!(matches!(
        verify_document(&signed, &anchors("rsa2048")),
        Err(VerifyError::Malformed { .. })
    ));
}

#[test]
fn a_signature_window_that_is_not_hexadecimal_is_refused() {
    let mut signed = sign(&bundled_examples().remove(0).1, "rsa2048");
    let window = layout(&signed).window;
    signed[window.start] = b'Z';
    assert_eq!(
        verify_document(&signed, &anchors("rsa2048")),
        Err(VerifyError::Malformed {
            what: "a /Contents string of hexadecimal digits only"
        })
    );
}

#[test]
fn a_cross_reference_offset_aimed_into_another_object_is_refused() {
    // The entry no longer points at the object it names, which is what a
    // crafted table does to make a reader resolve something else.
    let mut signed = sign(&bundled_examples().remove(0).1, "rsa2048");
    let marker = b"0000000000 65535 f";
    let at = find(&signed, marker).expect("a free head entry") + marker.len() + 2;
    signed[at..at + 10].copy_from_slice(b"0000000003");
    assert!(refused(verify_document(&signed, &anchors("rsa2048"))));
}

#[test]
fn arbitrary_bytes_are_refused_rather_than_parsed() {
    let anchors = anchors("rsa2048");
    for bytes in [
        b"".as_slice(),
        b"%PDF-1.7".as_slice(),
        b"%PDF-1.7\nstartxref\n999999\n%%EOF".as_slice(),
        b"not a pdf at all".as_slice(),
    ] {
        assert!(refused(verify_document(bytes, &anchors)), "{bytes:?}");
    }
}

#[test]
fn an_anchor_file_that_is_not_certificates_is_refused_without_panicking() {
    // Caller-supplied like everything else, and the decoder underneath
    // underflows on an empty input — hence the guard this exercises.
    for bytes in [
        b"".as_slice(),
        b"\n\n  \n".as_slice(),
        b"x".as_slice(),
        b"-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----\n".as_slice(),
        &example("business/receipt-ja/output.pdf")[..512],
    ] {
        assert!(TrustAnchors::from_pem(bytes).is_err());
    }
}
