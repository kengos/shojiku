//! Signing every bundled shape, and what has to remain true afterwards.

use shojiku_signing::{sign_document, PdfDocument, PlaceholderOptions};

use crate::common::{assert_verifies, bundled_examples, declared_ranges, find, signer};

#[test]
fn every_bundled_example_signs_and_verifies_with_both_algorithms() {
    // The shapes differ in ways that matter to the writer — one page or
    // several, link annotations present or absent, a dense form — and the
    // signature has to survive all of them under either algorithm.
    for (name, pdf) in bundled_examples() {
        for stem in ["rsa2048", "ec256"] {
            let signed = sign_document(&pdf, &signer(stem), &PlaceholderOptions::default())
                .unwrap_or_else(|error| panic!("signing {name} with {stem}: {error}"));
            assert_verifies(&signed, stem);
        }
    }
}

#[test]
fn signing_leaves_the_rendered_bytes_untouched_at_the_front() {
    // Append-only, checked against real rendered output rather than a
    // fixture: every byte the renderer produced is still where it was, which
    // is what makes the original document's own signature (if it had one)
    // survive a second one.
    for (name, pdf) in bundled_examples() {
        let signed = sign_document(&pdf, &signer("ec256"), &PlaceholderOptions::default())
            .unwrap_or_else(|error| panic!("signing {name}: {error}"));
        assert_eq!(
            &signed[..pdf.len()],
            pdf.as_slice(),
            "{name} was modified in place"
        );
        assert!(signed.len() > pdf.len(), "{name} gained no revision");
    }
}

#[test]
fn the_declared_ranges_account_for_every_byte_but_the_window() {
    // The check a verifier must make and this suite makes independently:
    // anything the ranges leave out is unsigned, so a gap anywhere other than
    // the signature window would be content someone could change afterwards.
    for (name, pdf) in bundled_examples() {
        let signed = sign_document(&pdf, &signer("rsa2048"), &PlaceholderOptions::default())
            .unwrap_or_else(|error| panic!("signing {name}: {error}"));
        let [first_at, first_len, second_at, second_len] = declared_ranges(&signed);
        assert_eq!(first_at, 0, "{name} leaves its opening bytes unsigned");
        assert_eq!(
            second_at + second_len,
            signed.len(),
            "{name} leaves trailing bytes unsigned"
        );
        assert_eq!(
            signed[first_len], b'<',
            "{name} gap does not start at the window"
        );
        assert_eq!(
            signed[second_at - 1],
            b'>',
            "{name} gap does not end at the window"
        );
    }
}

#[test]
fn a_signed_document_carries_one_signature_dictionary_and_one_form() {
    for (name, pdf) in bundled_examples() {
        let signed = sign_document(&pdf, &signer("ec256"), &PlaceholderOptions::default())
            .unwrap_or_else(|error| panic!("signing {name}: {error}"));
        assert!(find(&signed, b"/Type /Sig").is_some(), "{name}");
        assert!(
            find(&signed, b"/SubFilter /adbe.pkcs7.detached").is_some(),
            "{name}"
        );
        assert!(find(&signed, b"/SigFlags 3").is_some(), "{name}");
    }
}

#[test]
fn a_signed_document_is_still_a_readable_two_revision_document() {
    // Signing writes into a window and nothing else, but "nothing else" is a
    // claim about the writer, not about the result. This re-parses the
    // finished bytes: the header, the tail, the appended cross-reference
    // section and its `/Prev` chain all have to still read, or the signature
    // covers a file no reader will open. That the APPENDED catalog is the one
    // resolved — the copy carrying `/AcroForm` — is proven separately by the
    // sign-twice refusal below, which can only fire if the parser reaches it.
    for (name, pdf) in bundled_examples() {
        let signed = sign_document(&pdf, &signer("rsa2048"), &PlaceholderOptions::default())
            .unwrap_or_else(|error| panic!("signing {name}: {error}"));
        PdfDocument::parse(&signed)
            .unwrap_or_else(|error| panic!("re-reading the signed {name}: {error}"));
    }
}

#[test]
fn signing_a_document_twice_is_refused_by_name() {
    // The second pass meets its own `/AcroForm`, which this release does not
    // merge into. Refusing by name beats signing something the writer only
    // half understands.
    let pdf = crate::common::example("business/receipt-ja/output.pdf");
    let once = sign_document(&pdf, &signer("ec256"), &PlaceholderOptions::default())
        .expect("the first signature succeeds");
    let error = sign_document(&once, &signer("ec256"), &PlaceholderOptions::default())
        .expect_err("a second signature is refused");
    let message = error.to_string();
    assert!(message.contains("interactive form"), "{message}");
}

#[test]
fn an_rsa_signed_example_is_reproducible() {
    // Same document, same key, same bytes — the determinism the rest of the
    // engine promises, extended through the signing stage.
    let pdf = crate::common::example("business/receipt-ja/output.pdf");
    let first = sign_document(&pdf, &signer("rsa2048"), &PlaceholderOptions::default())
        .expect("signing succeeds");
    let second = sign_document(&pdf, &signer("rsa2048"), &PlaceholderOptions::default())
        .expect("signing succeeds again");
    assert_eq!(first, second);
}
