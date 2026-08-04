//! Unit tests for the two rules the external signing path adds.
//!
//! Both are pure functions over borrowed input precisely so they can be
//! exercised here, in the crate's OWN test binary, rather than only through
//! the integration suite: the coverage summary counts each crate twice, and a
//! line covered only in the copy linked into another binary can still fail
//! the gate.

use super::{parse_algorithm, require_signature, MAX_SIGNATURE_BYTES};
use crate::status::Failure;
use shojiku_signing::SignatureAlgorithm;

#[test]
fn both_wire_spellings_map_to_their_algorithm() {
    assert_eq!(
        parse_algorithm("rsa-pkcs1-sha256").ok(),
        Some(SignatureAlgorithm::RsaPkcs1Sha256)
    );
    assert_eq!(
        parse_algorithm("ecdsa-p256-sha256").ok(),
        Some(SignatureAlgorithm::EcdsaP256Sha256)
    );
}

#[test]
fn an_unsupported_algorithm_names_what_is_accepted_and_never_the_input() {
    let hostile = "ecdsa-p521-sha512-\u{202e}suffix";
    let Err(Failure::InvalidRequest(message)) = parse_algorithm(hostile) else {
        panic!("an unsupported algorithm is an invalid request");
    };
    assert!(
        message.contains("rsa-pkcs1-sha256") && message.contains("ecdsa-p256-sha256"),
        "{message}"
    );
    // The value is the caller's text; naming it back would be an echo channel
    // on a surface whose messages end up in another process's logs.
    assert!(!message.contains("p521"), "{message}");
    assert!(!message.contains('\u{202e}'), "{message}");
}

#[test]
fn an_empty_signature_is_refused_rather_than_written() {
    let Err(Failure::InvalidRequest(message)) = require_signature(&[]) else {
        panic!("an empty signature is an invalid request");
    };
    assert!(message.contains("signature"), "{message}");
}

#[test]
fn a_signature_with_bytes_passes_through_unchanged() {
    let signature = [0x30, 0x45, 0x02, 0x21];
    // `Failure` is deliberately not `Debug` — it carries messages, and a
    // derive would make it printable everywhere by accident — so the outcome
    // is destructured rather than unwrapped.
    let Ok(passed) = require_signature(&signature) else {
        panic!("a non-empty signature passes");
    };
    assert_eq!(passed, &signature[..]);
}

#[test]
fn the_signature_cap_is_the_reserved_window_itself() {
    // Not a round number chosen by taste: anything longer than the whole
    // window cannot fit a container, so the cap has a reason a later reader
    // can check.
    assert_eq!(
        MAX_SIGNATURE_BYTES,
        shojiku_signing::DEFAULT_CONTENTS_CAPACITY
    );
}
