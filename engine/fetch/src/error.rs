//! Failure modes of the host font-fetch layer. Every variant is a HARD error:
//! a pinned face either arrives with matching bytes or the run fails loudly —
//! there is no silent fallback to "some other font" (that would break the
//! determinism the sha256 pin exists to guarantee). Attacker-influenceable
//! text (manifest URLs) is clipped before it reaches a message.

use thiserror::Error;

/// Longest attacker-influenceable string echoed into an error message.
const CLIP: usize = 200;

/// Strips control characters and clips to [`CLIP`] chars. Manifest URLs are
/// untrusted input printed to a terminal, so they may not smuggle escape
/// sequences (cursor moves, colour codes) or run unbounded.
pub(crate) fn clip(s: &str) -> String {
    let mut out: String = s
        .chars()
        .filter(|c| !c.is_control())
        .take(CLIP)
        .collect::<String>();
    if s.chars().filter(|c| !c.is_control()).count() > CLIP {
        out.push('…');
    }
    out
}

#[derive(Debug, Error)]
pub enum FetchError {
    #[error("font pack `{pack}` face `{id}`: file `{path}` is missing and the manifest declares no `url:` to fetch it from")]
    MissingNoUrl {
        pack: String,
        id: String,
        path: String,
    },
    #[error("font pack `{pack}` face `{id}`: file is missing and offline mode blocked the fetch from `{url}` (warm the cache with an online run, or install the pack locally)")]
    Offline {
        pack: String,
        id: String,
        url: String,
    },
    #[error("font pack `{pack}` face `{id}`: `{url}` is not an allowed fetch source ({reason}); pass `--font-fetch-allow <host>` to trust it")]
    Policy {
        pack: String,
        id: String,
        url: String,
        reason: String,
    },
    #[error("font pack `{pack}` face `{id}`: fetch from `{url}` failed: {source}")]
    Transport {
        pack: String,
        id: String,
        url: String,
        source: TransportError,
    },
    #[error("font pack `{pack}` face `{id}`: bytes fetched from `{url}` do not match the manifest sha256 (expected {expected}, got {actual}) — refusing to use them")]
    Sha256Mismatch {
        pack: String,
        id: String,
        url: String,
        expected: String,
        actual: String,
    },
    #[error("font pack `{pack}` face `{id}`: manifest sha256 `{sha256}` is not 64 lowercase hex characters")]
    BadSha256 {
        pack: String,
        id: String,
        sha256: String,
    },
    #[error("font cache: failed to {action} {path}: {source}")]
    Cache {
        action: &'static str,
        path: String,
        source: std::io::Error,
    },
    #[error("font cache directory cannot be determined: set $SHOJIKU_CACHE_DIR")]
    NoCacheDir,
}

/// A transport-level failure. Kept separate from [`FetchError`] so the
/// `Transport` trait has no knowledge of packs or faces.
#[derive(Debug, Error)]
pub enum TransportError {
    #[error("{0}")]
    Io(String),
    #[error("unexpected HTTP status {0}")]
    Status(u16),
    #[error("redirect to `{0}`")]
    Redirect(String),
    #[error("redirect without a Location header")]
    RedirectNoLocation,
    #[error("too many redirects (limit {0})")]
    TooManyRedirects(u32),
    #[error("response exceeds the {0} byte size cap")]
    TooLarge(u64),
}
