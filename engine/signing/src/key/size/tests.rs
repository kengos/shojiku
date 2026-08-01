//! Measuring a modulus, including the shapes no key generator produces.

use der::asn1::UintRef;
use der::Encode;

use super::{bit_length, check_rsa_modulus, MAX_RSA_MODULUS_BITS, MIN_RSA_MODULUS_BITS};
use crate::key::KeyError;

/// Just enough of a PKCS#1 `RSAPrivateKey` to be measured: the two fields the
/// measurement reads, and nothing after them.
///
/// Building the structure rather than generating a key is what lets the edges
/// be tested at all — no `openssl` invocation produces a modulus of zero, and
/// generating one key per boundary would cost far more than the test is
/// worth. The hand-rolled `SEQUENCE` header below is checked by the tests
/// themselves: if it were wrong, the accept cases would report `Malformed`
/// rather than passing.
fn key_with_modulus(bytes: &[u8]) -> Vec<u8> {
    let mut body = 0u8.to_der().expect("encoding the version");
    body.extend(
        UintRef::new(bytes)
            .expect("a positive integer")
            .to_der()
            .expect("encoding the modulus"),
    );
    sequence(&body)
}

/// Wraps `body` in a DER `SEQUENCE` header, long-form length included.
fn sequence(body: &[u8]) -> Vec<u8> {
    let mut out = vec![0x30];
    if body.len() < 0x80 {
        out.push(u8::try_from(body.len()).expect("a short length fits in one byte"));
    } else {
        let be = body.len().to_be_bytes();
        let significant: Vec<u8> = be.iter().copied().skip_while(|byte| *byte == 0).collect();
        out.push(0x80 | u8::try_from(significant.len()).expect("at most eight length bytes"));
        out.extend(significant);
    }
    out.extend_from_slice(body);
    out
}

/// A modulus of exactly `bits` bits: a leading set bit and the rest zeros.
fn modulus_of(bits: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; bits / 8];
    bytes[0] = 0x80;
    bytes
}

#[test]
fn bit_length_of_nothing_is_zero() {
    assert_eq!(bit_length(&[]), 0);
}

#[test]
fn bit_length_counts_from_the_highest_set_bit() {
    assert_eq!(bit_length(&[0x01]), 1);
    assert_eq!(bit_length(&[0x80]), 8);
    assert_eq!(bit_length(&[0x01, 0x00]), 9);
    assert_eq!(bit_length(&[0xff, 0xff]), 16);
}

#[test]
fn a_modulus_of_zero_measures_zero_bits() {
    // Zero encodes as a single zero byte, which has no set bits at all — the
    // one input where the leading-byte arithmetic could underflow.
    assert_eq!(bit_length(&[0x00]), 0);
}

#[test]
fn the_supported_range_is_accepted_at_both_ends() {
    for bits in [2048, 3072, MAX_RSA_MODULUS_BITS] {
        assert!(
            check_rsa_modulus(&key_with_modulus(&modulus_of(bits))).is_ok(),
            "{bits} bits should be accepted"
        );
    }
}

#[test]
fn below_the_floor_is_refused_with_the_size() {
    let error = check_rsa_modulus(&key_with_modulus(&modulus_of(2040)))
        .expect_err("2040 bits is below the floor");
    assert_eq!(
        error,
        KeyError::RsaModulusTooSmall {
            bits: 2040,
            min: MIN_RSA_MODULUS_BITS,
        }
    );
}

#[test]
fn above_the_ceiling_is_refused_with_the_size() {
    let error = check_rsa_modulus(&key_with_modulus(&modulus_of(4104)))
        .expect_err("4104 bits is above the ceiling");
    assert_eq!(
        error,
        KeyError::RsaModulusTooLarge {
            bits: 4104,
            max: MAX_RSA_MODULUS_BITS,
        }
    );
}

#[test]
fn a_body_that_is_not_a_sequence_is_malformed() {
    // An INTEGER where a SEQUENCE belongs: the tag check, not the decode, is
    // what has to catch this.
    let der = 42u8.to_der().expect("encoding an integer");
    assert_eq!(
        check_rsa_modulus(&der).expect_err("a bare integer is refused"),
        KeyError::Malformed
    );
}

#[test]
fn a_truncated_body_is_malformed() {
    let full = key_with_modulus(&modulus_of(2048));
    for length in [0, 1, 4, full.len() / 2] {
        assert_eq!(
            check_rsa_modulus(full.get(..length).expect("a prefix of the key"))
                .expect_err("a truncated key is refused"),
            KeyError::Malformed,
            "truncated to {length} bytes"
        );
    }
}

#[test]
fn a_sequence_holding_only_a_version_is_malformed() {
    // The first integer decodes and the second has nothing to read: the
    // modulus field is absent rather than wrong.
    let version_only = [0x30, 0x03, 0x02, 0x01, 0x00];
    assert_eq!(
        check_rsa_modulus(&version_only).expect_err("a version-only key is refused"),
        KeyError::Malformed
    );
}
