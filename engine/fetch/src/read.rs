//! Reading a response body without trusting its length. The declared
//! `Content-Length` is a hint from the same untrusted source as the bytes, so
//! the cap is enforced against what actually arrives; the hash is computed in
//! the same pass, so nothing is ever written or parsed before it is verified.

use crate::error::TransportError;
use sha2::{Digest, Sha256};
use shojiku_diagnostics::Echo;
use std::io::Read;

/// Largest face the host will accept. The bundled rare-kanji fallback
/// (IPAmj Mincho) is ~47 MB, so the cap sits above it with headroom while still
/// bounding what a hostile URL can make the host buffer.
pub const MAX_FACE_BYTES: u64 = 64 * 1024 * 1024;

/// Bytes plus their digest, computed in one pass.
pub struct Hashed {
    pub bytes: Vec<u8>,
    pub sha256: String,
}

/// Summarized rather than derived: the payload is a whole font, and dumping
/// tens of megabytes into a panic message helps nobody.
impl std::fmt::Debug for Hashed {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Hashed")
            .field("len", &self.bytes.len())
            .field("sha256", &self.sha256)
            .finish()
    }
}

/// Reads at most `cap` bytes from `src`, hashing as it goes. Reading one byte
/// PAST the cap is what detects an oversized body: a body of exactly `cap`
/// bytes is accepted.
pub fn read_capped(src: &mut dyn Read, cap: u64) -> Result<Hashed, TransportError> {
    let mut hasher = Sha256::new();
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 64 * 1024];
    loop {
        let n = src
            .read(&mut chunk)
            .map_err(|e| TransportError::Io(Echo::from(e.to_string())))?;
        if n == 0 {
            break;
        }
        if bytes.len() as u64 + n as u64 > cap {
            return Err(TransportError::TooLarge(cap));
        }
        hasher.update(&chunk[..n]);
        bytes.extend_from_slice(&chunk[..n]);
    }
    Ok(Hashed {
        sha256: hex(&hasher.finalize()),
        bytes,
    })
}

/// Lowercase hex, matching the manifest `sha256` spelling.
pub fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0xf) as usize] as char);
    }
    s
}

/// True when `s` is exactly a lowercase 64-char hex digest. A manifest's
/// `sha256` becomes a cache FILE NAME, so it is validated before any path is
/// built from it — never trust it to be well-formed.
pub fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[cfg(test)]
mod tests;
