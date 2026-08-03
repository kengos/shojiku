//! Font-pack integrity + embedding-rights checks at load: the manifest
//! sha256 must match the file bytes (tamper/corruption), and the OS/2
//! `fsType` must permit embedding unless the pack attests a separately-held
//! embedding license (fsType cannot express purchased embed rights).

use super::{FontError, FontFace};
use sha2::{Digest, Sha256};
use shojiku_diagnostics::Echo;
use skrifa::raw::TableProvider;
use skrifa::FontRef;

/// OS/2 `fsType` bit 1 (0x0002) = Restricted License embedding: the face
/// must not be embedded in a document.
const FS_TYPE_RESTRICTED: u16 = 0x0002;

pub(super) fn verify_face(
    face: &FontFace,
    expected_sha256: &str,
    embedding_attested: bool,
) -> Result<(), FontError> {
    if hex(&Sha256::digest(face.data.as_slice())) != expected_sha256 {
        return Err(FontError::Sha256Mismatch(Echo::from(&face.id)));
    }
    if !embedding_attested && embedding_restricted(face) {
        return Err(FontError::EmbeddingRestricted(Echo::from(&face.id)));
    }
    Ok(())
}

/// True when the face's OS/2 `fsType` forbids embedding. A face without an
/// OS/2 table (or unparsable) is treated as unrestricted — the same bytes
/// already parsed once when the face loaded.
fn embedding_restricted(face: &FontFace) -> bool {
    FontRef::from_index(&face.data, 0)
        .ok()
        .and_then(|f| f.os2().ok())
        .is_some_and(|os2| os2.fs_type() & FS_TYPE_RESTRICTED != 0)
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0xf) as usize] as char);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::font::test_support::repo_font_dir;

    fn biz_bytes() -> Vec<u8> {
        let path = repo_font_dir().join("biz-ud/BIZUDPGothic-Regular.ttf");
        std::fs::read(path).expect("read biz")
    }

    fn sha_hex(bytes: &[u8]) -> String {
        hex(&Sha256::digest(bytes))
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
        let face = FontFace::from_bytes("biz", bytes).expect("face");
        let err = verify_face(&face, &sha, false).unwrap_err();
        assert!(matches!(err, FontError::EmbeddingRestricted(ref id) if id == "biz"));
        // An explicit embedding attestation bypasses the guard.
        assert!(verify_face(&face, &sha, true).is_ok());
    }
}
