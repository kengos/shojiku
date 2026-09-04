//! Font-pack integrity + embedding-rights checks at load: the manifest
//! sha256 must match the file bytes (tamper/corruption), and the OS/2
//! `fsType` must permit embedding unless the pack attests a separately-held
//! embedding license (fsType cannot express purchased embed rights).
//!
//! Both rules are also what a pack GENERATOR must satisfy, so each is
//! exposed as a byte-taking free function ([`face_sha256`],
//! [`embedding_restricted`]) and `verify_face` is written in terms of
//! them. A generator that computed its own digest, or read `fsType` its
//! own way, would be a second definition of "a valid pack" — and the two
//! would drift silently, since a pack that fails these checks is only
//! rejected at render time.

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
    if face_sha256(&face.data) != expected_sha256 {
        return Err(FontError::Sha256Mismatch(Echo::from(&face.id)));
    }
    if !embedding_attested && embedding_restricted(&face.data) {
        return Err(FontError::EmbeddingRestricted(Echo::from(&face.id)));
    }
    Ok(())
}

/// Lowercase-hex SHA-256 of a face's bytes — exactly the value a pack
/// manifest's `sha256` must carry for those bytes to load.
#[must_use]
pub fn face_sha256(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

/// True when the face's OS/2 `fsType` forbids embedding. A face without an
/// OS/2 table (or unparsable) is treated as unrestricted — at load these
/// are the same bytes that already parsed once when the face loaded, and a
/// generator refuses an unparsable file before it ever gets here.
#[must_use]
pub fn embedding_restricted(bytes: &[u8]) -> bool {
    FontRef::from_index(bytes, 0)
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
mod tests;
