//! Unit tests for font-pack integrity and embedding-rights checks.

use super::*;
use crate::font::test_support::repo_font_dir;

fn biz_bytes() -> Vec<u8> {
    let path = repo_font_dir().join("biz-ud/BIZUDPGothic-Regular.ttf");
    std::fs::read(path).expect("read biz")
}

fn sha_hex(bytes: &[u8]) -> String {
    face_sha256(bytes)
}

#[test]
fn face_sha256_is_lowercase_hex_of_the_bytes() {
    // The empty input's digest is the published SHA-256 constant, so this
    // pins the encoding (lowercase hex, 64 chars) without a fixture.
    assert_eq!(
        face_sha256(&[]),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}

#[test]
fn unparsable_bytes_are_not_reported_restricted() {
    assert!(!embedding_restricted(b"not a font"));
}

#[test]
fn matching_sha_and_installable_font_passes() {
    let bytes = biz_bytes();
    let sha = sha_hex(&bytes);
    let face = FontFace::from_bytes("biz", bytes).expect("face");
    assert!(verify_face(&face, &sha, false).is_ok());
}

#[test]
fn wrong_sha_is_rejected() {
    let face = FontFace::from_bytes("biz", biz_bytes()).expect("face");
    let err = verify_face(&face, "deadbeef", false).unwrap_err();
    assert!(matches!(err, FontError::Sha256Mismatch(ref id) if id == "biz"));
}

/// Offset of the OS/2 table in an sfnt, for the fsType patch below.
fn os2_offset(data: &[u8]) -> usize {
    let n = u16::from_be_bytes([data[4], data[5]]) as usize;
    (0..n)
        .map(|i| 12 + i * 16)
        .find(|&rec| &data[rec..rec + 4] == b"OS/2")
        .map(|rec| u32::from_be_bytes(data[rec + 8..rec + 12].try_into().unwrap()) as usize)
        .expect("OS/2 table")
}

#[test]
fn restricted_fstype_is_rejected_unless_attested() {
    // Patch fsType (OS/2 offset + 8) to the Restricted bit, re-hash so
    // the sha check passes and the embedding guard is what fires.
    let mut bytes = biz_bytes();
    let o = os2_offset(&bytes) + 8;
    bytes[o] = 0x00;
    bytes[o + 1] = 0x02;
    let sha = sha_hex(&bytes);
    // The exposed predicate and the load-time guard read the same bit.
    assert!(embedding_restricted(&bytes));
    let face = FontFace::from_bytes("biz", bytes).expect("face");
    let err = verify_face(&face, &sha, false).unwrap_err();
    assert!(matches!(err, FontError::EmbeddingRestricted(ref id) if id == "biz"));
    // An explicit embedding attestation bypasses the guard.
    assert!(verify_face(&face, &sha, true).is_ok());
}
