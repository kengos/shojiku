//! Unit tests for the capped read + digest helpers.

use super::*;
use sha2::{Digest, Sha256};

fn sha_of(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

#[test]
fn reads_body_and_hashes_it_in_one_pass() {
    let body = b"hello fonts".repeat(1000);
    let got = read_capped(&mut body.as_slice(), MAX_FACE_BYTES).expect("read");
    assert_eq!(got.bytes, body);
    assert_eq!(got.sha256, sha_of(&body));
}

#[test]
fn empty_body_hashes_to_the_empty_digest() {
    let got = read_capped(&mut [].as_slice(), 16).expect("read");
    assert!(got.bytes.is_empty());
    assert_eq!(got.sha256, sha_of(b""));
}

#[test]
fn body_of_exactly_the_cap_is_accepted() {
    let body = vec![7u8; 64];
    let got = read_capped(&mut body.as_slice(), 64).expect("read");
    assert_eq!(got.bytes.len(), 64);
}

#[test]
fn body_one_byte_over_the_cap_is_rejected() {
    let body = vec![7u8; 65];
    let err = read_capped(&mut body.as_slice(), 64).unwrap_err();
    assert!(matches!(err, TransportError::TooLarge(64)), "got: {err:?}");
}

#[test]
fn oversized_body_is_rejected_even_when_it_spans_many_chunks() {
    // Larger than the internal 64 KiB chunk, so the cap is enforced mid-stream
    // rather than only on the first read.
    let body = vec![0u8; 200 * 1024];
    let err = read_capped(&mut body.as_slice(), 100 * 1024).unwrap_err();
    assert!(matches!(err, TransportError::TooLarge(_)), "got: {err:?}");
}

#[test]
fn read_errors_surface_as_transport_io() {
    struct Failing;
    impl std::io::Read for Failing {
        fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("socket died"))
        }
    }
    let err = read_capped(&mut Failing, 64).unwrap_err();
    assert!(matches!(err, TransportError::Io(ref m) if m.contains("socket died")));
}

#[test]
fn debug_summarizes_rather_than_dumping_the_font() {
    // A panic message must not carry tens of megabytes of font bytes.
    let body = vec![0xABu8; 4096];
    let got = read_capped(&mut body.as_slice(), MAX_FACE_BYTES).expect("read");
    let shown = format!("{got:?}");
    assert!(shown.contains("len: 4096"), "got: {shown}");
    assert!(shown.contains(&got.sha256), "got: {shown}");
    assert!(
        shown.len() < 200,
        "dumped the payload: {} chars",
        shown.len()
    );
}

#[test]
fn hex_is_lowercase_and_zero_padded() {
    assert_eq!(hex(&[0x00, 0x0f, 0xa0, 0xff]), "000fa0ff");
    assert_eq!(hex(&[]), "");
}

#[test]
fn sha256_hex_validation_accepts_only_64_lowercase_hex() {
    assert!(is_sha256_hex(&"a".repeat(64)));
    assert!(is_sha256_hex(&sha_of(b"x")));
    // Wrong length.
    assert!(!is_sha256_hex(&"a".repeat(63)));
    assert!(!is_sha256_hex(&"a".repeat(65)));
    assert!(!is_sha256_hex(""));
    // Uppercase is not the manifest spelling.
    assert!(!is_sha256_hex(&"A".repeat(64)));
    // Non-hex, and the traversal attempt a cache path must never see.
    assert!(!is_sha256_hex(&"g".repeat(64)));
    assert!(!is_sha256_hex("../../etc/passwd"));
    assert!(!is_sha256_hex(&format!("{}/../x", "a".repeat(58))));
}
