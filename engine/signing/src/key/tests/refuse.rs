//! Every way a key file is refused, and what the refusal tells the caller.

use super::{ec_pem_with_body, load, load_with, relabel};
use crate::key::{KeyError, PrivateKey, MAX_RSA_MODULUS_BITS, MIN_RSA_MODULUS_BITS};
use crate::testkit::keys::keys;

/// A legacy OpenSSL encrypted key, in the form `openssl` wrote before PKCS#8
/// became its default. The headers are what identifies it; the body is not
/// read, and does not need to be real for the rejection to be correct.
const LEGACY_ENCRYPTED: &[u8] = b"-----BEGIN RSA PRIVATE KEY-----\n\
Proc-Type: 4,ENCRYPTED\n\
DEK-Info: DES-EDE3-CBC,0123456789ABCDEF\n\
\n\
bm90IGEgcmVhbCBrZXk=\n\
-----END RSA PRIVATE KEY-----\n";

#[test]
fn a_legacy_encrypted_key_names_the_conversion_command() {
    let error = PrivateKey::from_pem(LEGACY_ENCRYPTED, None)
        .err()
        .expect("a legacy key is refused");
    assert_eq!(error, KeyError::LegacyPem);
    // The whole point of the variant: the message hands over the fix, not
    // just a verdict.
    let message = error.to_string();
    assert!(message.contains("openssl pkcs8 -topk8"), "{message}");
}

#[test]
fn a_legacy_unencrypted_key_is_recognised_by_its_label_alone() {
    // No `DEK-Info`, so only the label identifies it. PKCS#1 needs the same
    // conversion, so it gets the same answer.
    let pem = relabel(&keys().read("rsa2048.key.pem"), "RSA PRIVATE KEY");
    assert_eq!(
        PrivateKey::from_pem(&pem, None)
            .err()
            .expect("a PKCS#1 label is refused"),
        KeyError::LegacyPem
    );
}

#[test]
fn a_certificate_is_not_a_private_key() {
    assert_eq!(
        PrivateKey::from_pem(&keys().read("rsa2048.cert.pem"), None)
            .err()
            .expect("a certificate is refused"),
        KeyError::UnsupportedLabel
    );
}

#[test]
fn junk_text_is_not_pem() {
    assert_eq!(
        PrivateKey::from_pem(b"this is not a key", None)
            .err()
            .expect("junk is refused"),
        KeyError::NotPem
    );
}

#[test]
fn bytes_that_are_not_text_are_not_pem() {
    assert_eq!(
        PrivateKey::from_pem(&[0xff, 0xfe, 0x00, 0x01], None)
            .err()
            .expect("bytes are refused"),
        KeyError::NotPem
    );
}

#[test]
fn an_empty_file_is_not_pem() {
    assert_eq!(
        PrivateKey::from_pem(b"", None)
            .err()
            .expect("an empty file is refused"),
        KeyError::NotPem
    );
}

#[test]
fn a_truncated_key_is_not_pem() {
    let pem = keys().read("rsa2048.key.pem");
    let half = pem.len() / 2;
    assert_eq!(
        PrivateKey::from_pem(&pem[..half], None)
            .err()
            .expect("half a key is refused"),
        KeyError::NotPem
    );
}

#[test]
fn pem_that_is_not_a_pkcs8_key_is_malformed() {
    // Valid PEM, valid DER, correct label — and a certificate inside. Only
    // the PKCS#8 decode can catch this one.
    let pem = relabel(&keys().read("rsa2048.cert.pem"), "PRIVATE KEY");
    assert_eq!(
        PrivateKey::from_pem(&pem, None)
            .err()
            .expect("a mislabelled certificate is refused"),
        KeyError::Malformed
    );
}

#[test]
fn an_encrypted_key_without_a_passphrase_says_which_is_missing() {
    let error = load("rsa2048.enc.pem")
        .err()
        .expect("an encrypted key needs a passphrase");
    assert_eq!(error, KeyError::PassphraseRequired);
    assert!(error.to_string().contains("passphrase"));
}

#[test]
fn a_wrong_passphrase_is_refused_without_repeating_it() {
    let wrong = b"not the passphrase";
    let error = load_with("rsa2048.enc.pem", wrong)
        .err()
        .expect("a wrong passphrase is refused");
    assert_eq!(error, KeyError::PassphraseRejected);
    let message = error.to_string();
    assert!(
        !message.contains("not the passphrase"),
        "the error repeated the passphrase: {message}"
    );
}

#[test]
fn an_unsupported_algorithm_is_named() {
    assert_eq!(
        load("ed25519.key.pem").err().expect("Ed25519 is refused"),
        KeyError::UnsupportedAlgorithm
    );
}

#[test]
fn an_unsupported_curve_is_refused() {
    // The algorithm is right and only the curve is wrong, so this reaches a
    // different branch from the one above.
    assert_eq!(
        load("ec384.key.pem").err().expect("P-384 is refused"),
        KeyError::UnsupportedAlgorithm
    );
}

#[test]
fn an_rsa_key_below_the_signing_floor_names_its_size() {
    let error = load("rsa1024.key.pem")
        .err()
        .expect("a 1024-bit key is refused");
    assert_eq!(
        error,
        KeyError::RsaModulusTooSmall {
            bits: 1024,
            min: MIN_RSA_MODULUS_BITS,
        }
    );
    let message = error.to_string();
    assert!(message.contains("1024"), "{message}");
    assert!(message.contains("2047"), "{message}");
}

#[test]
fn an_rsa_key_above_the_signing_ceiling_names_its_size() {
    // The backend verifies with moduli larger than it will sign with, so a
    // caller can hold a key whose documents check out but which cannot make
    // new ones. Saying the size is what makes that diagnosable.
    let error = load("rsa5120.key.pem")
        .err()
        .expect("a 5120-bit key is refused");
    assert_eq!(
        error,
        KeyError::RsaModulusTooLarge {
            bits: 5120,
            max: MAX_RSA_MODULUS_BITS,
        }
    );
    let message = error.to_string();
    assert!(message.contains("5120"), "{message}");
    assert!(message.contains("4096"), "{message}");
}

#[test]
fn an_rsa_key_the_backend_refuses_is_reported() {
    // In range on modulus, so our own size check passes; the public exponent
    // is 3, which the backend will not sign with.
    assert_eq!(
        load("rsa2048-e3.key.pem")
            .err()
            .expect("a small public exponent is refused"),
        KeyError::Rejected
    );
}

#[test]
fn an_ec_key_the_backend_refuses_is_reported() {
    let pem = ec_pem_with_body(b"not an elliptic curve private key");
    assert_eq!(
        PrivateKey::from_pem(&pem, None)
            .err()
            .expect("a broken EC body is refused"),
        KeyError::Rejected
    );
}

#[test]
fn no_key_error_message_repeats_the_key_or_the_passphrase() {
    // One sweep over every refusal the surface can produce, because "this
    // particular error does not leak" is a property that has to hold for all
    // of them at once, not one at a time.
    let passphrase = b"a secret nobody should see";
    let cases = [
        PrivateKey::from_pem(LEGACY_ENCRYPTED, Some(passphrase)),
        PrivateKey::from_pem(b"junk", Some(passphrase)),
        PrivateKey::from_pem(&keys().read("rsa2048.cert.pem"), Some(passphrase)),
        PrivateKey::from_pem(&keys().read("rsa2048.enc.pem"), Some(passphrase)),
        PrivateKey::from_pem(&keys().read("rsa1024.key.pem"), Some(passphrase)),
        PrivateKey::from_pem(&keys().read("rsa5120.key.pem"), Some(passphrase)),
        PrivateKey::from_pem(&keys().read("ed25519.key.pem"), Some(passphrase)),
        PrivateKey::from_pem(&keys().read("ec384.key.pem"), Some(passphrase)),
    ];
    let key_body = String::from_utf8(keys().read("rsa2048.key.pem")).expect("PEM is text");
    let secret_line = key_body
        .lines()
        .nth(1)
        .expect("a PEM body has a first base64 line");
    for case in cases {
        let message = case
            .err()
            .expect("every case in this sweep is a refusal")
            .to_string();
        assert!(
            !message.contains("a secret nobody should see"),
            "an error repeated the passphrase: {message}"
        );
        assert!(
            !message.contains(secret_line),
            "an error repeated key material: {message}"
        );
    }
}
