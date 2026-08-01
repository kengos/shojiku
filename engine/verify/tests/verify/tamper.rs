//! One byte changed after signing, in each of the two places it can be.

use shojiku_verify::{verify_document, CheckOutcome};

use crate::common::{anchors, bundled_examples, layout, sign, ALGORITHMS};

#[test]
fn a_byte_changed_inside_the_signed_region_fails_the_signature_and_nothing_else() {
    for stem in ALGORITHMS {
        let (name, pdf) = bundled_examples().remove(0);
        let mut signed = sign(&pdf, stem);
        // Well inside the original document's body, so the structure a
        // reader walks to FIND the signature is untouched and only the
        // digest changes.
        let at = signed.len() / 4;
        signed[at] ^= 0x01;
        let report = verify_document(&signed, &anchors(stem))
            .unwrap_or_else(|error| panic!("{name} with {stem}: {error}"));
        assert!(!report.is_valid(), "{name} with {stem}");
        assert_eq!(report.coverage(), CheckOutcome::Passed, "{stem}");
        assert_eq!(
            report.signature(),
            CheckOutcome::Failed {
                reason: "the digest the signature covers is not the digest of the signed bytes"
            },
            "{stem}"
        );
    }
}

#[test]
fn a_byte_changed_inside_the_signature_payload_is_never_reported_valid() {
    for stem in ALGORITHMS {
        let (_, pdf) = bundled_examples().remove(0);
        let mut signed = sign(&pdf, stem);
        let window = layout(&signed).window;
        // The window holds uppercase hexadecimal digits; swap one for
        // another, which keeps it decodable and changes what it decodes to.
        signed[window.start] = if signed[window.start] == b'A' {
            b'B'
        } else {
            b'A'
        };
        match verify_document(&signed, &anchors(stem)) {
            // Either the container stops decoding or the signature stops
            // checking out. A valid verdict is the one impossible answer.
            Err(_) => {}
            Ok(report) => assert!(!report.is_valid(), "{stem}: {report:?}"),
        }
    }
}

#[test]
fn a_document_signed_by_one_key_does_not_verify_against_another() {
    let (_, pdf) = bundled_examples().remove(0);
    let signed = sign(&pdf, "rsa2048");
    // The signature still checks out — it is the signer's own certificate
    // that travels with it — but nobody the caller trusts vouches for it.
    let report = verify_document(&signed, &anchors("ec256")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert_eq!(
        report.trust_chain(),
        CheckOutcome::Failed {
            reason: "the certificate chain does not reach a supplied trust anchor"
        }
    );
}
