//! What a verifier finds inside a finished container.

use cms::signed_data::SignerIdentifier;
use der::asn1::ObjectIdentifier;
use der::Decode;
use ring::signature::{VerificationAlgorithm, ECDSA_P256_SHA256_ASN1, RSA_PKCS1_2048_8192_SHA256};

use super::{attributes, container, decode, only_signer, private_key, DIGEST};
use crate::key::SignatureAlgorithm;
use crate::oid;

/// A container finished with placeholder signature bytes.
fn finished(stem: &str, algorithm: SignatureAlgorithm) -> Vec<u8> {
    container(stem, algorithm)
        .finish(b"a signature")
        .expect("the container finishes")
}

#[test]
fn the_signed_attributes_are_exactly_content_type_and_message_digest() {
    let signed = decode(&finished("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256));
    let oids: Vec<_> = attributes(&signed)
        .as_ref()
        .iter()
        .map(|attribute| attribute.oid)
        .collect();
    assert_eq!(oids.len(), 2, "exactly two attributes: {oids:?}");
    assert!(oids.contains(&oid::ID_CONTENT_TYPE));
    assert!(oids.contains(&oid::ID_MESSAGE_DIGEST));
}

#[test]
fn no_signing_time_attribute_is_written() {
    // Deliberate rather than forgotten. A wall-clock attribute would make the
    // same document sign to different bytes on every run, and it proves
    // nothing about when the signature was really made — an unauthenticated
    // clock is the signer's own claim.
    let signing_time = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.5");
    let signed = decode(&finished("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256));
    assert!(attributes(&signed)
        .as_ref()
        .iter()
        .all(|attribute| attribute.oid != signing_time));
}

#[test]
fn the_content_is_detached_and_typed_as_data() {
    // What the signature covers lives in the PDF, not in this structure.
    let signed = decode(&finished("ec256", SignatureAlgorithm::EcdsaP256Sha256));
    assert_eq!(signed.encap_content_info.econtent_type, oid::ID_DATA);
    assert!(signed.encap_content_info.econtent.is_none());
}

#[test]
fn the_signer_is_identified_by_issuer_and_serial() {
    let signed = decode(&finished("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256));
    assert!(matches!(
        only_signer(&signed).sid,
        SignerIdentifier::IssuerAndSerialNumber(_)
    ));
}

#[test]
fn the_certificate_travels_with_the_signature() {
    // A verifier holding only the document must still be able to see which
    // certificate to check the signature against.
    let signed = decode(&finished("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256));
    let certificates = signed.certificates.expect("the certificate set is present");
    assert_eq!(certificates.0.as_ref().len(), 1);
}

#[test]
fn the_digest_algorithm_is_sha256_with_absent_parameters() {
    // RFC 5754 §2: SHA-2 identifiers are generated with the parameters
    // absent, not with an explicit NULL.
    let signed = decode(&finished("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256));
    let algorithm = signed
        .digest_algorithms
        .as_ref()
        .first()
        .expect("one digest algorithm")
        .clone();
    assert_eq!(algorithm.oid, oid::ID_SHA_256);
    assert!(algorithm.parameters.is_none());
}

#[test]
fn rsa_signatures_are_labelled_rsa_encryption_with_null_parameters() {
    // RFC 3370 §3.2 asks for exactly this shape.
    let signed = decode(&finished("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256));
    let algorithm = only_signer(&signed).signature_algorithm;
    assert_eq!(algorithm.oid, oid::RSA_ENCRYPTION);
    assert!(algorithm.parameters.is_some());
}

#[test]
fn ecdsa_signatures_are_labelled_ecdsa_with_sha256_and_no_parameters() {
    // RFC 5758 §3.2: the parameters MUST be absent.
    let signed = decode(&finished("ec256", SignatureAlgorithm::EcdsaP256Sha256));
    let algorithm = only_signer(&signed).signature_algorithm;
    assert_eq!(algorithm.oid, oid::ECDSA_WITH_SHA_256);
    assert!(algorithm.parameters.is_none());
}

#[test]
fn the_signature_bytes_are_carried_through_unchanged() {
    let signed = decode(
        &container("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256)
            .finish(b"the exact bytes")
            .expect("the container finishes"),
    );
    assert_eq!(
        only_signer(&signed).signature.as_bytes(),
        b"the exact bytes"
    );
}

#[test]
fn the_bytes_to_be_signed_are_a_set_not_a_tagged_field() {
    // RFC 5652 §5.4: the signature covers the attributes under an EXPLICIT
    // `SET OF` tag (0x31), never the `[0] IMPLICIT` form they take inside the
    // signer info. Signing the tagged form yields a container every
    // conformant verifier rejects, and nothing else in this pipeline would
    // notice — which is why the tag byte is pinned here directly.
    let to_be_signed = container("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256)
        .to_be_signed()
        .expect("the attributes encode");
    assert_eq!(to_be_signed.first(), Some(&0x31));
}

#[test]
fn the_digest_is_inside_the_bytes_that_get_signed() {
    // The only reason signing those bytes says anything about the document.
    let to_be_signed = container("rsa2048", SignatureAlgorithm::RsaPkcs1Sha256)
        .to_be_signed()
        .expect("the attributes encode");
    assert!(
        to_be_signed.windows(DIGEST.len()).any(|w| w == DIGEST),
        "the digest is not inside the signed attributes"
    );
}

#[test]
fn a_signature_verifies_against_the_certificate_that_travels_with_it() {
    // The round trip the crate exists to make possible, in its smallest form:
    // sign the attribute bytes, then verify them with the public key taken
    // from the certificate the container carries.
    let cases: [(&str, SignatureAlgorithm, &dyn VerificationAlgorithm); 2] = [
        (
            "rsa2048",
            SignatureAlgorithm::RsaPkcs1Sha256,
            &RSA_PKCS1_2048_8192_SHA256,
        ),
        (
            "ec256",
            SignatureAlgorithm::EcdsaP256Sha256,
            &ECDSA_P256_SHA256_ASN1,
        ),
    ];
    for (stem, algorithm, verifier) in cases {
        let container = container(stem, algorithm);
        let to_be_signed = container.to_be_signed().expect("the attributes encode");
        let signature = private_key(stem)
            .sign(&to_be_signed)
            .expect("signing succeeds");
        let certificate = x509_cert::Certificate::from_der(&super::certificate_der(stem))
            .expect("the certificate parses");
        let public_key = certificate
            .tbs_certificate
            .subject_public_key_info
            .subject_public_key
            .as_bytes()
            .expect("the public key is whole bytes");
        ring::signature::UnparsedPublicKey::new(verifier, public_key)
            .verify(&to_be_signed, &signature)
            .unwrap_or_else(|_| panic!("the {stem} signature should verify"));
    }
}
