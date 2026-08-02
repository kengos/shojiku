//! Unit tests for trust anchors, chain building, and validity periods.

use super::*;
use crate::testkit::keys;

/// One certificate from the generated key material.
fn certificate(stem: &str) -> Certificate {
    let pem = keys::read(&format!("{stem}.cert.pem"));
    Certificate::load_pem_chain(&pem)
        .expect("the fixture certificate loads")
        .remove(0)
}

/// Seconds since the epoch at a moment inside every fresh fixture's validity.
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("the clock is after the epoch")
        .as_secs()
}

#[test]
fn anchors_load_from_pem_certificates() {
    let anchors = keys::anchors("ca");
    assert_eq!(anchors.as_slice().len(), 1);
}

#[test]
fn several_certificates_in_one_file_all_become_anchors() {
    let mut pem = keys::read("ca.cert.pem");
    pem.extend_from_slice(&keys::read("other-ca.cert.pem"));
    let anchors = TrustAnchors::from_pem(&pem).expect("both load");
    assert_eq!(anchors.as_slice().len(), 2);
}

#[test]
fn anchor_input_that_is_not_pem_certificates_is_refused() {
    assert_eq!(
        TrustAnchors::from_pem(b"-----BEGIN NONSENSE-----\n").expect_err("fails"),
        VerifyError::AnchorNotPem
    );
}

#[test]
fn an_empty_anchor_file_is_refused_rather_than_trusting_nothing_silently() {
    // There is no default to fall back on — the operating system's trust
    // store is never consulted — so "no anchors" is a caller error, not an
    // empty set that fails every document for an obscure reason.
    assert_eq!(
        TrustAnchors::from_pem(b"").expect_err("fails"),
        VerifyError::NoTrustAnchors
    );
}

#[test]
fn more_anchors_than_this_release_reads_are_refused() {
    let one = keys::read("ca.cert.pem");
    let mut pem = Vec::new();
    for _ in 0..=MAX_TRUST_ANCHORS {
        pem.extend_from_slice(&one);
    }
    assert_eq!(
        TrustAnchors::from_pem(&pem).expect_err("fails"),
        VerifyError::LimitExceeded {
            what: "trust anchors",
            cap: MAX_TRUST_ANCHORS
        }
    );
}

#[test]
fn a_self_signed_signer_that_is_itself_the_anchor_is_trusted() {
    let signer = certificate("rsa2048");
    let (validity, trust) = check(&signer, &[], &keys::anchors("rsa2048"), now());
    assert_eq!(trust, CheckOutcome::Passed);
    assert_eq!(validity, CheckOutcome::Passed);
}

#[test]
fn a_leaf_is_trusted_through_the_authority_that_issued_it() {
    let leaf = certificate("leaf");
    let (validity, trust) = check(&leaf, &[], &keys::anchors("ca"), now());
    assert_eq!(trust, CheckOutcome::Passed);
    assert_eq!(validity, CheckOutcome::Passed);
}

#[test]
fn a_leaf_whose_authority_is_not_an_anchor_is_untrusted() {
    let leaf = certificate("leaf");
    let (_, trust) = check(&leaf, &[], &keys::anchors("other-ca"), now());
    assert_eq!(
        trust,
        CheckOutcome::failed("the certificate chain does not reach a supplied trust anchor")
    );
}

#[test]
fn an_issuer_offered_in_the_container_still_has_to_reach_an_anchor() {
    // The authority travels with the document but is not trusted, so the
    // chain is complete and still worthless. The walk climbs leaf -> ca and
    // then finds ca is its own issuer, which ends it: a self-signed root
    // that is not an anchor leads nowhere.
    let leaf = certificate("leaf");
    let others = vec![certificate("ca")];
    let (_, trust) = check(&leaf, &others, &keys::anchors("other-ca"), now());
    assert_eq!(
        trust,
        CheckOutcome::failed("the certificate chain does not reach a supplied trust anchor")
    );
}

#[test]
fn an_expired_certificate_fails_validity_while_its_chain_still_holds() {
    // Two independent checks: the chain to the authority is fine, and the
    // certificate is simply out of date. A caller should learn both at once.
    let expired = certificate("leaf-expired");
    let (validity, trust) = check(&expired, &[], &keys::anchors("ca"), now());
    assert_eq!(trust, CheckOutcome::Passed);
    assert_eq!(
        validity,
        CheckOutcome::failed("a certificate in the chain has expired")
    );
}

#[test]
fn a_certificate_is_not_yet_valid_before_its_own_start() {
    // The clock is a parameter, which is what makes this testable at all:
    // the fixture was issued today and is asked about in 1971.
    let leaf = certificate("leaf");
    let (validity, _) = check(&leaf, &[], &keys::anchors("ca"), 60 * 60 * 24 * 365);
    assert_eq!(
        validity,
        CheckOutcome::failed("a certificate in the chain is not yet valid")
    );
}

#[test]
fn validity_is_still_judged_when_the_chain_could_not_be_completed() {
    // The signer's own dates are checked even with no path to an anchor, so
    // one failure does not hide the other.
    let expired = certificate("leaf-expired");
    let (validity, trust) = check(&expired, &[], &keys::anchors("other-ca"), now());
    assert!(!trust.is_passed());
    assert_eq!(
        validity,
        CheckOutcome::failed("a certificate in the chain has expired")
    );
}

#[test]
fn an_issuer_that_is_not_marked_as_an_authority_is_not_accepted() {
    // `rsa2048` is self-signed WITHOUT basicConstraints, so it can be an
    // anchor by identity but can never issue for anyone else. Name chaining
    // alone must not be enough.
    let leaf = certificate("leaf");
    let impostor = vec![certificate("rsa2048")];
    let (_, trust) = check(&leaf, &impostor, &keys::anchors("rsa2048"), now());
    assert_eq!(
        trust,
        CheckOutcome::failed("the certificate chain does not reach a supplied trust anchor")
    );
}

#[test]
fn a_self_signed_certificate_that_is_not_an_anchor_does_not_loop() {
    // The shape a hostile document would use to make the walk run forever:
    // a certificate that issues itself. The walk refuses to revisit it and
    // reports the truth, which is that no anchor was reached.
    let ca = certificate("ca");
    let others = vec![certificate("ca")];
    let (_, trust) = check(&ca, &others, &keys::anchors("other-ca"), now());
    assert_eq!(
        trust,
        CheckOutcome::failed("the certificate chain does not reach a supplied trust anchor")
    );
}

#[test]
fn the_anchor_cap_is_reached_before_anything_is_decoded() {
    // Undecodable bodies: if the cap were applied to the DECODED list, this
    // input would fail as "not PEM" — the decoder would have been handed
    // every block first, which is the work the cap exists to refuse. The
    // limit answer is therefore the proof that nothing was decoded.
    let mut pem = Vec::new();
    for _ in 0..=MAX_TRUST_ANCHORS {
        pem.extend_from_slice(
            b"-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----\n",
        );
    }
    assert_eq!(
        TrustAnchors::from_pem(&pem).expect_err("fails"),
        VerifyError::LimitExceeded {
            what: "trust anchors",
            cap: MAX_TRUST_ANCHORS
        }
    );
}

#[test]
fn pem_that_holds_no_certificate_at_all_is_refused() {
    // Not empty — the guard above catches that — but carrying no
    // `CERTIFICATE` block either, so the decoder returns an empty list and
    // there is still nothing to trust.
    assert_eq!(
        TrustAnchors::from_pem(b"x").expect_err("fails"),
        VerifyError::NoTrustAnchors
    );
}
