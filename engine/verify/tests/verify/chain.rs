//! Certificates that should not be trusted, over real documents.

use shojiku_verify::{verify_document, CheckOutcome};

use crate::common::{anchors, bundled_examples, signer_with};
use shojiku_signing::{sign_document, PlaceholderOptions};

/// Signs the first bundled example with `key_stem`'s key under
/// `cert_stem`'s certificate.
fn signed_as(key_stem: &str, cert_stem: &str) -> Vec<u8> {
    let (_, pdf) = bundled_examples().remove(0);
    sign_document(
        &pdf,
        &signer_with(key_stem, cert_stem),
        &PlaceholderOptions::default(),
    )
    .expect("a bundled example signs")
}

#[test]
fn a_certificate_issued_by_a_trusted_authority_verifies() {
    let signed = signed_as("leaf", "leaf");
    let report = verify_document(&signed, &anchors("ca")).expect("evaluates");
    assert!(report.is_valid(), "{report:?}");
}

#[test]
fn an_expired_certificate_fails_validity_with_a_reason_of_its_own() {
    // Everything else about the document is right — the signature holds and
    // the chain reaches the authority — so this is the check reporting on
    // its own rather than a general failure.
    let signed = signed_as("leaf", "leaf-expired");
    let report = verify_document(&signed, &anchors("ca")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert_eq!(report.coverage(), CheckOutcome::Passed);
    assert_eq!(report.trust_chain(), CheckOutcome::Passed);
    assert_eq!(
        report.certificate_validity(),
        CheckOutcome::Failed {
            reason: "a certificate in the chain has expired"
        }
    );
}

#[test]
fn a_chain_that_does_not_reach_the_supplied_anchor_fails_trust() {
    let signed = signed_as("leaf", "leaf");
    let report = verify_document(&signed, &anchors("other-ca")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert_eq!(report.certificate_validity(), CheckOutcome::Passed);
    assert_eq!(
        report.trust_chain(),
        CheckOutcome::Failed {
            reason: "the certificate chain does not reach a supplied trust anchor"
        }
    );
}
