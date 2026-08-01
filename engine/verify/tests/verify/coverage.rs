//! The forgeries a signature check alone would call valid.
//!
//! Both documents here carry a signature that is genuinely correct over the
//! bytes it claims. What is wrong with them is what those claims leave out —
//! which is why coverage is a check of its own, and why its failure has to
//! be distinguishable from a bad signature.

use ring::digest::{digest, SHA256};
use shojiku_signing::{PdfDocument, RevisionBuilder, SignatureContainer, Signer};
use shojiku_verify::{verify_document, CheckOutcome};

use crate::common::{anchors, bundled_examples, layout, sign, signer_with};

#[test]
fn a_revision_appended_after_signing_fails_coverage_while_the_signature_holds() {
    for (name, pdf) in bundled_examples() {
        let signed = sign(&pdf, "rsa2048");
        let document = PdfDocument::parse(&signed).expect("the signed document parses");
        let mut builder = RevisionBuilder::new(&document);
        let number = builder.allocate().expect("a free object number");
        builder.set_object(number, Vec::from(b"<</Type /Note>>".as_slice()));
        let extended = builder.finish().expect("appends").into_bytes();

        let report = verify_document(&extended, &anchors("rsa2048"))
            .unwrap_or_else(|error| panic!("{name}: {error}"));
        assert!(!report.is_valid(), "{name}");
        // Two separate facts, asserted separately: the signature is fine and
        // the document grew. A verifier that collapsed these into one
        // verdict could not explain what happened.
        assert_eq!(report.signature(), CheckOutcome::Passed, "{name}");
        assert_eq!(
            report.coverage(),
            CheckOutcome::Failed {
                reason: "the signed range does not reach the end of the file"
            },
            "{name}"
        );
    }
}

#[test]
fn a_valid_signature_over_an_interior_gap_fails_coverage() {
    // Built rather than described: the declared range stops one byte short
    // of the signature window, and the signature is then computed over
    // exactly that shortened claim. Every cryptographic check passes.
    let (_, pdf) = bundled_examples().remove(0);
    let mut signed = sign(&pdf, "rsa2048");

    let marker = b"/ByteRange [";
    let range_at = crate::common::find(&signed, marker).expect("a range array") + marker.len();
    let shortened = layout(&signed).range[1] - 1;
    let field = format!("{shortened:010}");
    signed[range_at + 11..range_at + 21].copy_from_slice(field.as_bytes());

    let after = layout(&signed);
    let mut covered = Vec::new();
    covered.extend_from_slice(&signed[after.range[0]..after.range[0] + after.range[1]]);
    covered.extend_from_slice(&signed[after.range[2]..after.range[2] + after.range[3]]);

    let signer = signer_with("rsa2048", "rsa2048");
    let container = SignatureContainer::new(
        signer.certificate_pem(),
        digest(&SHA256, &covered).as_ref(),
        signer.algorithm(),
    )
    .expect("the container builds");
    let signature = signer
        .sign(&container.to_be_signed().expect("the attributes encode"))
        .expect("the fixture key signs");
    let der = container.finish(&signature).expect("the container encodes");
    write_window(&mut signed, &after.window, &der);

    let report = verify_document(&signed, &anchors("rsa2048")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert_eq!(
        report.coverage(),
        CheckOutcome::Failed {
            reason: "the signed range does not run up to the signature window"
        }
    );
}

/// Writes `der` as uppercase hexadecimal into `window`, leaving the padding.
fn write_window(pdf: &mut [u8], window: &core::ops::Range<usize>, der: &[u8]) {
    const DIGITS: &[u8; 16] = b"0123456789ABCDEF";
    let characters = der.iter().flat_map(|byte| {
        [
            DIGITS[usize::from(byte >> 4)],
            DIGITS[usize::from(byte & 0x0f)],
        ]
    });
    for (slot, character) in pdf[window.start..window.end].iter_mut().zip(characters) {
        *slot = character;
    }
}
