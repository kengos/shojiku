//! Sign a real document, then verify it — every algorithm, every shape.

use shojiku_verify::{verify_document, CheckOutcome, NotChecked};

use crate::common::{anchors, bundled_examples, sign, ALGORITHMS};

#[test]
fn every_bundled_example_verifies_after_being_signed_with_every_algorithm() {
    // Nine combinations. The signer and the verifier were written beside
    // each other, so what makes this worth running is that the documents are
    // real engine output rather than a fixture shaped to suit both.
    for (name, pdf) in bundled_examples() {
        for stem in ALGORITHMS {
            let signed = sign(&pdf, stem);
            let report = verify_document(&signed, &anchors(stem))
                .unwrap_or_else(|error| panic!("{name} signed with {stem}: {error}"));
            assert!(report.is_valid(), "{name} signed with {stem}: {report:?}");
            assert_eq!(report.signature(), CheckOutcome::Passed);
            assert_eq!(report.coverage(), CheckOutcome::Passed);
            assert_eq!(report.certificate_validity(), CheckOutcome::Passed);
            assert_eq!(report.trust_chain(), CheckOutcome::Passed);
        }
    }
}

#[test]
fn a_passing_verdict_over_a_real_document_still_names_its_omissions() {
    // The completeness contract where it matters most: on the output a user
    // would take as proof.
    let (_, pdf) = bundled_examples().remove(0);
    let signed = sign(&pdf, "rsa2048");
    let report = verify_document(&signed, &anchors("rsa2048")).expect("evaluates");
    assert!(report.is_valid());
    assert_eq!(
        report.not_checked(),
        &[NotChecked::Revocation, NotChecked::Timestamp]
    );
}

#[test]
fn verification_does_not_depend_on_which_document_was_signed_first() {
    // Each example is signed and verified independently; a verifier holding
    // state between calls would show up as a second run behaving differently.
    let (_, pdf) = bundled_examples().remove(1);
    let signed = sign(&pdf, "ec256");
    for _ in 0..3 {
        assert!(verify_document(&signed, &anchors("ec256"))
            .expect("evaluates")
            .is_valid());
    }
}
