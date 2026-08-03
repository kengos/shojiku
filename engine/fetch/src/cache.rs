//! The local font cache: content-addressed blobs keyed by the manifest
//! sha256, so a cached face is self-describing — the file name IS the
//! expectation, and a blob whose bytes stop matching it is simply a miss.
//! Filling this cache is the whole point of the fetch layer: once warm, an
//! `--offline` run renders exactly what an online one did.

use crate::error::FetchError;
use crate::read::{hex, is_sha256_hex};
use sha2::{Digest, Sha256};
use shojiku_diagnostics::Echo;
use std::path::{Path, PathBuf};

/// A cache rooted at a directory. The root is created lazily on first write,
/// so a read-only run never makes directories.
#[derive(Debug, Clone)]
pub struct FontCache {
    root: PathBuf,
}

/// The cache root: `$SHOJIKU_CACHE_DIR` if set, else the platform's
/// user-cache location. Hand-rolled rather than via the `dirs` crate, whose
/// transitive `option-ext` is MPL-2.0 and would fail `cargo deny`.
pub fn default_cache_root() -> Option<PathBuf> {
    env_path("SHOJIKU_CACHE_DIR").or_else(|| platform_base().map(|b| b.join("shojiku")))
}

/// The platform's user-cache directory. Selected with `#[cfg]` rather than a
/// runtime `cfg!` so only the host's own branch is compiled — the others are
/// not dead lines in every build's coverage.
#[cfg(target_os = "macos")]
fn platform_base() -> Option<PathBuf> {
    env_path("HOME").map(|h| h.join("Library/Caches"))
}

#[cfg(windows)]
fn platform_base() -> Option<PathBuf> {
    env_path("LOCALAPPDATA")
}

#[cfg(not(any(target_os = "macos", windows)))]
fn platform_base() -> Option<PathBuf> {
    env_path("XDG_CACHE_HOME").or_else(|| env_path("HOME").map(|h| h.join(".cache")))
}

/// A non-empty environment variable as a path. Empty is treated as unset —
/// an exported-but-blank `$HOME` must not root the cache at `/Library/Caches`.
fn env_path(key: &str) -> Option<PathBuf> {
    std::env::var_os(key)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

impl FontCache {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// The cache at the default root, or [`FetchError::NoCacheDir`] when the
    /// platform gives us nowhere to put it.
    pub fn discover() -> Result<Self, FetchError> {
        default_cache_root()
            .map(Self::new)
            .ok_or(FetchError::NoCacheDir)
    }

    /// Where the blob for `sha256` lives. `None` for a malformed digest: the
    /// value comes from an untrusted manifest and would become a path segment.
    pub fn blob_path(&self, sha256: &str) -> Option<PathBuf> {
        is_sha256_hex(sha256).then(|| self.root.join("fonts").join(sha256))
    }

    /// The cached bytes for `sha256`, if a blob exists AND still hashes to it.
    /// A blob that fails the re-check is deleted and reported as a miss, so a
    /// truncated or tampered cache heals itself on the next run instead of
    /// failing forever.
    pub fn get(&self, sha256: &str) -> Option<PathBuf> {
        let path = self.blob_path(sha256)?;
        let bytes = std::fs::read(&path).ok()?;
        if hex(&Sha256::digest(&bytes)) == sha256 {
            return Some(path);
        }
        let _ = std::fs::remove_file(&path);
        None
    }

    /// Stores `bytes` under `sha256` and returns the blob path. The caller has
    /// already verified the digest — this does not re-hash.
    ///
    /// The write is atomic: a unique temp file in the same directory is renamed
    /// into place, so a concurrent run (or a crash mid-write) can never leave a
    /// partial blob that a later run would read as a whole font.
    pub fn put(&self, sha256: &str, bytes: &[u8]) -> Result<PathBuf, FetchError> {
        let path = self.blob_path(sha256).ok_or_else(|| FetchError::Cache {
            action: "build a cache path for",
            path: Echo::from(sha256),
            source: std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "digest is not 64 lowercase hex characters",
            ),
        })?;
        let dir = path.parent().unwrap_or(&self.root);
        cache_io("create", dir, std::fs::create_dir_all(dir))?;
        let tmp = dir.join(format!(".{sha256}.{}.tmp", unique_suffix()));
        cache_io("write", &tmp, std::fs::write(&tmp, bytes))?;
        match std::fs::rename(&tmp, &path) {
            Ok(()) => Ok(path),
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                Err(cache_err("commit", &path, e))
            }
        }
    }
}

/// Distinguishes concurrent writers of the SAME blob (same pid, parallel
/// threads), so their temp files cannot collide.
fn unique_suffix() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!(
        "{}.{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

fn cache_io(action: &'static str, path: &Path, r: std::io::Result<()>) -> Result<(), FetchError> {
    r.map_err(|e| cache_err(action, path, e))
}

fn cache_err(action: &'static str, path: &Path, source: std::io::Error) -> FetchError {
    FetchError::Cache {
        action,
        path: Echo::from(path),
        source,
    }
}

#[cfg(test)]
mod tests;
