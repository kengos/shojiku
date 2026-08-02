//! Unit tests for the verification entry points.
//!
//! Where the module tests each check on its own, these run the whole
//! pipeline and assert on the REPORT — including the two facts a verifier
//! could get wrong while every individual check works: that a valid
//! signature over an incomplete range is reported as a coverage failure and
//! not a signature failure, and that the omissions are stated on a passing
//! verdict.

use super::*;
use crate::testkit::{
    build_pdf, interior_gap_forgery, keys, layout, signed_by, signed_pdf, simple_pdf,
};

#[test]
fn a_freshly_signed_document_verifies_against_its_own_certificate() {
    let report =
        verify_document(&signed_pdf("rsa2048"), &keys::anchors("rsa2048")).expect("evaluates");
    assert!(report.is_valid(), "{report:?}");
}

#[test]
fn a_valid_verdict_still_states_what_was_not_checked() {
    // The completeness contract, asserted on a PASSING verification: the
    // omission has to be visible in the output, not implied by its absence.
    let report = verify_document(&signed_pdf("ec256"), &keys::anchors("ec256")).expect("evaluates");
    assert!(report.is_valid());
    assert_eq!(
        report.not_checked(),
        &[NotChecked::Revocation, NotChecked::Timestamp]
    );
}

#[test]
fn a_document_signed_by_a_certified_leaf_verifies_through_its_authority() {
    let signed = signed_by(&keys::signer_with("leaf", "leaf"));
    let report = verify_document(&signed, &keys::anchors("ca")).expect("evaluates");
    assert!(report.is_valid(), "{report:?}");
}

#[test]
fn the_wrong_anchor_fails_trust_while_the_signature_still_holds() {
    let signed = signed_by(&keys::signer_with("leaf", "leaf"));
    let report = verify_document(&signed, &keys::anchors("other-ca")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert_eq!(report.coverage(), CheckOutcome::Passed);
    assert!(!report.trust_chain().is_passed());
}

#[test]
fn an_expired_certificate_fails_validity_and_nothing_else() {
    let signed = signed_by(&keys::signer_with("leaf", "leaf-expired"));
    let report = verify_document(&signed, &keys::anchors("ca")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert_eq!(report.coverage(), CheckOutcome::Passed);
    assert_eq!(report.trust_chain(), CheckOutcome::Passed);
    assert_eq!(
        report.certificate_validity(),
        CheckOutcome::failed("a certificate in the chain has expired")
    );
}

#[test]
fn the_time_verification_asks_about_is_the_callers() {
    // The same document, valid now and not yet valid in 1971 — which is the
    // whole reason the clock is a parameter.
    let signed = signed_pdf("rsa2048");
    let anchors = keys::anchors("rsa2048");
    let year_one = verify_document_at(&signed, &anchors, 60 * 60 * 24 * 365).expect("evaluates");
    assert_eq!(
        year_one.certificate_validity(),
        CheckOutcome::failed("a certificate in the chain is not yet valid")
    );
    assert!(verify_document(&signed, &anchors)
        .expect("evaluates")
        .is_valid());
}

#[test]
fn a_byte_flipped_inside_the_signed_region_fails_the_signature_alone() {
    let mut signed = signed_pdf("rsa2048");
    // Inside a page's own dictionary — covered by the signature, and not
    // part of any structure the reader needs to FIND the signature. A byte
    // chosen by offset would land in the cross-reference table of a fixture
    // this small and break parsing instead of the digest.
    let at = crate::testkit::find(&signed, b"842").expect("the page's media box");
    signed[at + 2] = b'3';
    let report = verify_document(&signed, &keys::anchors("rsa2048")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.coverage(), CheckOutcome::Passed);
    assert_eq!(
        report.signature(),
        CheckOutcome::failed(
            "the digest the signature covers is not the digest of the signed bytes"
        )
    );
}

#[test]
fn a_byte_flipped_inside_the_signature_payload_is_never_reported_valid() {
    let mut signed = signed_pdf("ec256");
    let window = layout(&signed).window;
    // The window holds uppercase hexadecimal; flip one digit to another.
    signed[window.start] = if signed[window.start] == b'A' {
        b'B'
    } else {
        b'A'
    };
    match verify_document(&signed, &keys::anchors("ec256")) {
        // Either the container no longer decodes, or it decodes and does not
        // check out. What must not happen is a valid verdict.
        Err(_) => {}
        Ok(report) => assert!(!report.is_valid(), "{report:?}"),
    }
}

#[test]
fn a_revision_appended_after_signing_fails_coverage_while_the_signature_holds() {
    // The forgery an incremental-update format invites, and the reason
    // coverage is a check of its own: the signature is genuinely valid over
    // the bytes it claims, and the document grew afterwards.
    let signed = signed_pdf("rsa2048");
    let document = shojiku_signing::PdfDocument::parse(&signed).expect("parses");
    let mut builder = shojiku_signing::RevisionBuilder::new(&document);
    let number = builder.allocate().expect("a free object number");
    builder.set_object(number, Vec::from(b"<</Type /Note>>".as_slice()));
    let extended = builder.finish().expect("appends").into_bytes();

    let report = verify_document(&extended, &keys::anchors("rsa2048")).expect("evaluates");
    assert!(!report.is_valid());
    // Distinguishable, and asserted as two separate facts — a verifier that
    // reported one failure for both would be no use explaining this.
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert_eq!(
        report.coverage(),
        CheckOutcome::failed("the signed range does not reach the end of the file")
    );
}

#[test]
fn a_valid_signature_over_an_interior_gap_fails_coverage() {
    // Built, not described: the ranges skip one byte before the window and
    // the signature was computed over exactly those ranges, so every
    // cryptographic check passes on a document that left something out.
    let forged = interior_gap_forgery("rsa2048");
    let report = verify_document(&forged, &keys::anchors("rsa2048")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert_eq!(
        report.coverage(),
        CheckOutcome::failed("the signed range does not run up to the signature window")
    );
}

#[test]
fn ranges_that_leave_the_document_fail_for_their_own_reason() {
    let mut signed = signed_pdf("rsa2048");
    let before = layout(&signed);
    // Push the second range's length past the end of the file. The array is
    // inside the signed region, so the signature would fail anyway — the
    // point here is that the bytes cannot even be gathered, and that this
    // says so rather than panicking on the slice.
    // The widest value the fixed-width field holds, which is far past the
    // end of any fixture: ten digits in, ten digits out, so nothing moves.
    let field = format!("{:010}", 9_999_999_999u64);
    signed[before.range_at + 33..before.range_at + 43].copy_from_slice(field.as_bytes());
    let report = verify_document(&signed, &keys::anchors("rsa2048")).expect("evaluates");
    assert_eq!(
        report.signature(),
        CheckOutcome::failed("the signed ranges do not lie inside the document")
    );
    assert!(!report.coverage().is_passed());
}

#[test]
fn bytes_that_are_not_a_pdf_cannot_be_evaluated() {
    assert!(matches!(
        verify_document(b"not a pdf", &keys::anchors("rsa2048")),
        Err(VerifyError::Document(_))
    ));
}

#[test]
fn an_unsigned_document_carries_nothing_to_evaluate() {
    assert_eq!(
        verify_document(&simple_pdf(), &keys::anchors("rsa2048")),
        Err(VerifyError::NoSignature)
    );
}

#[test]
fn a_document_whose_signature_dictionary_is_broken_cannot_be_evaluated() {
    // A filled-in signature field whose window is not hexadecimal at all:
    // structured refusal, not a crash and not a verdict.
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields [5 0 R]>>"),
        (5, "<</FT /Sig/V 6 0 R>>"),
        (
            6,
            "<</Type /Sig/SubFilter /adbe.pkcs7.detached/Contents <zz>>>",
        ),
    ];
    assert_eq!(
        verify_document(&build_pdf(objects, 3), &keys::anchors("rsa2048")),
        Err(VerifyError::Malformed {
            what: "a /Contents string of hexadecimal digits only"
        })
    );
}

#[test]
fn a_truncated_signed_document_fails_at_every_cut_without_panicking() {
    let signed = signed_pdf("rsa2048");
    let anchors = keys::anchors("rsa2048");
    // Every 64th prefix rather than all of them: the point is that no cut
    // reaches a panicking path, and each one costs a full parse.
    for cut in (0..signed.len()).step_by(64) {
        let outcome = verify_document(&signed[..cut], &anchors);
        assert!(
            outcome.as_ref().is_ok_and(|report| !report.is_valid()) || outcome.is_err(),
            "a document cut at {cut} bytes was reported valid"
        );
    }
}

#[test]
fn no_failure_message_can_carry_a_fragment_of_the_document() {
    // Structural, not stylistic: every message this crate can produce is a
    // fixed string, so a hostile file cannot get its own bytes into a log
    // through an error. The sweep proves it over real refusals.
    let anchors = keys::anchors("rsa2048");
    let signed = signed_pdf("rsa2048");
    let mut messages: Vec<String> = Vec::new();
    for cut in (0..signed.len()).step_by(37) {
        if let Err(error) = verify_document(&signed[..cut], &anchors) {
            messages.push(error.to_string());
        }
    }
    assert!(!messages.is_empty(), "the sweep produced no refusals");
    for message in messages {
        assert!(
            message.is_ascii() && !message.contains("PDF-1.7") && !message.contains("obj"),
            "a message quoted the document: {message}"
        );
    }
}
