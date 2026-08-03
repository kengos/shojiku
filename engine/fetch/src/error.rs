//! Failure modes of the host font-fetch layer. Every variant is a HARD error:
//! a pinned face either arrives with matching bytes or the run fails loudly —
//! there is no silent fallback to "some other font" (that would break the
//! determinism the sha256 pin exists to guarantee). Attacker-influenceable
//! text (manifest URLs) is clipped before it reaches a message.

use shojiku_diagnostics::Echo;
use thiserror::Error;

/// Every attacker-influenceable field is an [`Echo`], so the bound is the
/// field TYPE rather than a call each construction site has to remember.
/// It used to be a local `clip()` applied at seven call sites — and only to
/// the URLs, leaving pack ids, face ids and file paths unbounded.
#[derive(Debug, Error)]
pub enum FetchError {
    #[error("font pack `{pack}` face `{id}`: file `{path}` is missing and the manifest declares no `url:` to fetch it from")]
    MissingNoUrl { pack: Echo, id: Echo, path: Echo },
    #[error("font pack `{pack}` face `{id}`: file is missing and offline mode blocked the fetch from `{url}` (warm the cache with an online run, or install the pack locally)")]
    Offline { pack: Echo, id: Echo, url: Echo },
    #[error("font pack `{pack}` face `{id}`: `{url}` is not an allowed fetch source ({reason}); pass `--font-fetch-allow <host>` to trust it")]
    Policy {
        pack: Echo,
        id: Echo,
        url: Echo,
        reason: Echo,
    },
    #[error("font pack `{pack}` face `{id}`: fetch from `{url}` failed: {source}")]
    Transport {
        pack: Echo,
        id: Echo,
        url: Echo,
        source: TransportError,
    },
    #[error("font pack `{pack}` face `{id}`: bytes fetched from `{url}` do not match the manifest sha256 (expected {expected}, got {actual}) — refusing to use them")]
    Sha256Mismatch {
        pack: Echo,
        id: Echo,
        url: Echo,
        expected: Echo,
        actual: Echo,
    },
    #[error("font pack `{pack}` face `{id}`: manifest sha256 `{sha256}` is not 64 lowercase hex characters")]
    BadSha256 { pack: Echo, id: Echo, sha256: Echo },
    #[error("font cache: failed to {action} {path}: {source}")]
    Cache {
        action: &'static str,
        path: Echo,
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
    Io(Echo),
    #[error("unexpected HTTP status {0}")]
    Status(u16),
    #[error("redirect to `{0}`")]
    Redirect(Echo),
    #[error("redirect without a Location header")]
    RedirectNoLocation,
    #[error("too many redirects (limit {0})")]
    TooManyRedirects(u32),
    #[error("response exceeds the {0} byte size cap")]
    TooLarge(u64),
}
