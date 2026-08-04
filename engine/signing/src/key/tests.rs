//! Loading private keys: the formats accepted, and every one refused.
//!
//! The refusals matter as much as the acceptances here. A key file is
//! something a caller produced elsewhere, often years ago with whatever
//! `openssl` defaults were current, so "which of my files is this, and what do
//! I do about it" is the question these tests pin answers to.

use der::{Decode, Document, Encode};
use pkcs8::spki::AlgorithmIdentifierRef;
use pkcs8::{LineEnding, PrivateKeyInfo};

use super::{KeyError, PrivateKey, SignatureAlgorithm};
use crate::oid;
use crate::testkit::keys::keys;

mod accept;
mod refuse;

#[test]
fn each_algorithm_answers_to_the_name_hosts_spell_it_with() {
    assert_eq!(
        SignatureAlgorithm::from_wire("rsa-pkcs1-sha256"),
        Some(SignatureAlgorithm::RsaPkcs1Sha256)
    );
    assert_eq!(
        SignatureAlgorithm::from_wire("ecdsa-p256-sha256"),
        Some(SignatureAlgorithm::EcdsaP256Sha256)
    );
}

#[test]
fn a_name_no_algorithm_has_is_not_resolved_to_one() {
    assert_eq!(SignatureAlgorithm::from_wire("rsa"), None);
    // A near miss is the case worth pinning separately: a caller reaching for
    // SHA-1 must be refused rather than quietly upgraded to the SHA-256
    // algorithm whose name it almost spells.
    assert_eq!(SignatureAlgorithm::from_wire("rsa-pkcs1-sha1"), None);
}

#[test]
fn every_algorithms_own_name_resolves_back_to_it() {
    for algorithm in [
        SignatureAlgorithm::RsaPkcs1Sha256,
        SignatureAlgorithm::EcdsaP256Sha256,
    ] {
        assert_eq!(
            SignatureAlgorithm::from_wire(algorithm.wire_name()),
            Some(algorithm)
        );
    }
}

/// Loads a generated key with no passphrase.
fn load(name: &str) -> Result<PrivateKey, KeyError> {
    PrivateKey::from_pem(&keys().read(name), None)
}

/// Loads a generated key with a passphrase.
fn load_with(name: &str, passphrase: &[u8]) -> Result<PrivateKey, KeyError> {
    PrivateKey::from_pem(&keys().read(name), Some(passphrase))
}

/// Re-labels a PEM file's DER under a different label.
///
/// Builds a file that decodes as PEM and claims to be a private key while
/// holding something else — the shape that separates "not PEM" from "PEM, but
/// not a PKCS#8 key".
fn relabel(pem: &[u8], label: &'static str) -> Vec<u8> {
    let text = core::str::from_utf8(pem).expect("generated PEM is text");
    let (_, document) = Document::from_pem(text).expect("generated PEM decodes");
    document
        .to_pem(label, LineEnding::LF)
        .expect("re-encoding as PEM")
        .into_bytes()
}

/// Builds a PKCS#8 file that is structurally valid and cryptographically
/// nonsense: a well-formed P-256 header over a private key that is not one.
///
/// This is the only way to reach the backend's own rejection on the elliptic
/// curve path, since every check before it passes.
fn ec_pem_with_body(private_key: &[u8]) -> Vec<u8> {
    let parameters = oid::SECP_256_R_1.to_der().expect("encoding a curve name");
    let info = PrivateKeyInfo {
        algorithm: AlgorithmIdentifierRef {
            oid: oid::ID_EC_PUBLIC_KEY,
            parameters: Some(der::AnyRef::from_der(&parameters).expect("decoding a curve name")),
        },
        private_key,
        public_key: None,
    };
    let der = info.to_der().expect("encoding a private-key info");
    Document::try_from(der)
        .expect("a private-key info is valid DER")
        .to_pem("PRIVATE KEY", LineEnding::LF)
        .expect("re-encoding as PEM")
        .into_bytes()
}
