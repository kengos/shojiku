//! The key formats this release reads, and the signatures they produce.

use super::{load, load_with};
use crate::key::SignatureAlgorithm;
use crate::testkit::keys::keys;

#[test]
fn unencrypted_rsa_loads_and_reports_its_algorithm() {
    let key = load("rsa2048.key.pem").expect("an unencrypted PKCS#8 RSA key loads");
    assert_eq!(key.algorithm(), SignatureAlgorithm::RsaPkcs1Sha256);
}

#[test]
fn unencrypted_ec_loads_and_reports_its_algorithm() {
    let key = load("ec256.key.pem").expect("an unencrypted PKCS#8 P-256 key loads");
    assert_eq!(key.algorithm(), SignatureAlgorithm::EcdsaP256Sha256);
}

#[test]
fn encrypted_rsa_loads_with_the_right_passphrase() {
    let key = load_with("rsa2048.enc.pem", &keys().passphrase())
        .expect("an encrypted PKCS#8 RSA key loads");
    assert_eq!(key.algorithm(), SignatureAlgorithm::RsaPkcs1Sha256);
}

#[test]
fn encrypted_ec_loads_with_the_right_passphrase() {
    let key = load_with("ec256.enc.pem", &keys().passphrase())
        .expect("an encrypted PKCS#8 P-256 key loads");
    assert_eq!(key.algorithm(), SignatureAlgorithm::EcdsaP256Sha256);
}

#[test]
fn an_rsa_signature_is_one_modulus_wide_and_deterministic() {
    let key = load("rsa2048.key.pem").expect("the key loads");
    let first = key.sign(b"a message").expect("signing succeeds");
    let second = key.sign(b"a message").expect("signing succeeds twice");
    // 2048 bits of modulus is 256 bytes of signature, and PKCS#1 v1.5 has no
    // nonce, so the same message signs to the same bytes. That property is
    // what makes a signed document reproducible.
    assert_eq!(first.len(), 256);
    assert_eq!(first, second);
}

#[test]
fn an_ecdsa_signature_is_der_and_differs_between_signings() {
    let key = load("ec256.key.pem").expect("the key loads");
    let first = key.sign(b"a message").expect("signing succeeds");
    let second = key.sign(b"a message").expect("signing succeeds twice");
    // ECDSA draws a random nonce per signature, so two signatures over one
    // message differ. Both are ASN.1 SEQUENCEs of two integers.
    assert_eq!(first.first(), Some(&0x30));
    assert_ne!(first, second);
}

#[test]
fn signing_the_same_message_with_different_keys_differs() {
    let rsa = load("rsa2048.key.pem").expect("the RSA key loads");
    let ec = load("ec256.key.pem").expect("the EC key loads");
    assert_ne!(
        rsa.sign(b"a message").expect("RSA signing succeeds"),
        ec.sign(b"a message").expect("ECDSA signing succeeds")
    );
}
