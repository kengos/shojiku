//! Unit tests for algorithm selection and the signature check.

use super::*;
use shojiku_signing::oid;

#[test]
fn the_two_cms_signature_algorithms_are_recognized() {
    assert_eq!(
        SignatureAlgorithm::from_oid(oid::RSA_ENCRYPTION),
        Ok(SignatureAlgorithm::RsaPkcs1Sha256)
    );
    assert_eq!(
        SignatureAlgorithm::from_oid(oid::ECDSA_WITH_SHA_256),
        Ok(SignatureAlgorithm::EcdsaP256Sha256)
    );
}

#[test]
fn any_other_cms_signature_algorithm_is_refused_by_name() {
    assert_eq!(
        SignatureAlgorithm::from_oid(oid::ID_SHA_256).expect_err("fails"),
        VerifyError::Unsupported {
            what:
                "a signature algorithm other than RSA PKCS#1 v1.5 or ECDSA P-256, both over SHA-256"
        }
    );
}

#[test]
fn a_certificate_spells_rsa_differently_than_cms_does() {
    // The whole reason for a second table: a certificate says
    // `sha256WithRSAEncryption` where CMS says `rsaEncryption`, and reusing
    // one for the other would reject every real certificate.
    assert_eq!(
        SignatureAlgorithm::from_certificate_oid(oid::SHA_256_WITH_RSA_ENCRYPTION),
        Ok(SignatureAlgorithm::RsaPkcs1Sha256)
    );
    assert_eq!(
        SignatureAlgorithm::from_certificate_oid(oid::ECDSA_WITH_SHA_256),
        Ok(SignatureAlgorithm::EcdsaP256Sha256)
    );
    // And the CMS spelling is NOT accepted on a certificate.
    assert_eq!(
        SignatureAlgorithm::from_certificate_oid(oid::RSA_ENCRYPTION).expect_err("fails"),
        VerifyError::Unsupported {
            what: "a certificate signature algorithm other than sha256WithRSAEncryption or ecdsa-with-SHA256"
        }
    );
}

#[test]
fn the_signature_check_rejects_a_digest_that_is_not_the_documents() {
    let container = crate::testkit::container("rsa2048");
    assert_eq!(
        check(&container, b"some other bytes entirely"),
        CheckOutcome::failed(
            "the digest the signature covers is not the digest of the signed bytes"
        )
    );
}

#[test]
fn the_signature_check_rejects_a_signature_that_does_not_belong_to_the_key() {
    // Same document, but the signature bytes flipped: the digest still
    // matches, so this exercises the cryptographic arm on its own.
    let (mut container, covered) = crate::testkit::container_and_covered("rsa2048");
    container.signature[0] ^= 0xff;
    assert_eq!(
        check(&container, &covered),
        CheckOutcome::failed(
            "the signature does not check out against the certificate's public key"
        )
    );
}

#[test]
fn the_signature_check_passes_over_the_bytes_that_were_signed() {
    let (container, covered) = crate::testkit::container_and_covered("ec256");
    assert_eq!(check(&container, &covered), CheckOutcome::Passed);
}

#[test]
fn a_public_key_that_is_not_a_whole_number_of_bytes_is_refused() {
    // An X.509 public key is a BIT STRING, so a certificate can declare
    // unused trailing bits and leave the key not byte-aligned. There is
    // nothing to hand the backend then, and the refusal has to be a
    // structured `Err` rather than an unwrap on the missing bytes.
    let pem = crate::testkit::keys::read("rsa2048.cert.pem");
    let mut certificate = x509_cert::Certificate::load_pem_chain(&pem)
        .expect("the fixture certificate loads")
        .remove(0);
    certificate
        .tbs_certificate
        .subject_public_key_info
        .subject_public_key =
        der::asn1::BitString::new(1, [0x80u8].as_slice()).expect("a bit string with unused bits");
    assert_eq!(
        verify_with(
            &certificate,
            SignatureAlgorithm::RsaPkcs1Sha256,
            b"message",
            b"signature"
        ),
        Err("the certificate's public key is not a whole number of bytes")
    );
}
