//! Making every resolved face present on disk before the font store loads it.
//!
//! This is the whole host-side contract: a template may reference a face by
//! *pin* (`sha256` + a `url:` hint) rather than by shipped bytes, and the host
//! fills its cache before render. The render path itself never gets here — by
//! the time layout runs, every face is a plain local file, which is what keeps
//! render/sign/verify socket-free and byte-identical between an online run and
//! a later `--offline` one.

use crate::cache::FontCache;
use crate::error::{FetchError, TransportError};
use crate::policy::FetchPolicy;
use crate::read::{is_sha256_hex, MAX_FACE_BYTES};
use crate::transport::Transport;
use shojiku_diagnostics::Echo;
use shojiku_formatter::FaceSpec;

/// How many `Location` hops a fetch will follow. Each hop is re-checked
/// against the policy; the limit stops a redirect loop.
const MAX_REDIRECTS: u32 = 3;

/// What [`ensure_faces`] actually did, so a host can tell the user.
#[derive(Debug, Default)]
pub struct FetchReport {
    /// `(face id, url)` for each face fetched over the network this run.
    ///
    /// Both are [`Echo`]s: the CLI prints this pair to stderr, and both the
    /// face id and the URL come from a font-pack manifest. The URL was
    /// bounded from the start; the id was not, which left the same hole on
    /// the same line.
    pub fetched: Vec<(Echo, Echo)>,
}

/// Whether missing faces may be fetched.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Fetch missing pinned faces (the default UX: fonts auto-download).
    Online,
    /// Never open a socket; a missing face is an error even with a `url:`.
    Offline,
}

/// Returns `specs` with every face guaranteed to exist at its `path`, fetching
/// and caching the missing ones.
///
/// Per face, in order: a present file is left completely alone (so a shipped
/// pack never touches the cache or the network); otherwise a cache blob for its
/// `sha256` repoints the path; otherwise the `url:` hint is fetched, verified
/// against the pin, cached, and repointed.
///
/// Bytes are hashed BEFORE they are written or handed on, so unverified bytes
/// never reach the cache and a mismatch is a hard error — never a fallback to
/// a different font, which would silently change the document.
pub fn ensure_faces(
    specs: Vec<FaceSpec>,
    cache: &FontCache,
    policy: &FetchPolicy,
    transport: &dyn Transport,
    mode: Mode,
) -> Result<(Vec<FaceSpec>, FetchReport), FetchError> {
    let mut report = FetchReport::default();
    let mut out = Vec::with_capacity(specs.len());
    for mut spec in specs {
        if !spec.path.is_file() {
            spec.path = ensure_one(&spec, cache, policy, transport, mode, &mut report)?;
        }
        out.push(spec);
    }
    Ok((out, report))
}

/// Resolves ONE missing face to a cache blob path.
fn ensure_one(
    spec: &FaceSpec,
    cache: &FontCache,
    policy: &FetchPolicy,
    transport: &dyn Transport,
    mode: Mode,
    report: &mut FetchReport,
) -> Result<std::path::PathBuf, FetchError> {
    // The digest is a cache file name and the integrity check; a malformed one
    // is a broken manifest, not something to paper over.
    if !is_sha256_hex(&spec.sha256) {
        return Err(FetchError::BadSha256 {
            pack: Echo::from(&spec.pack),
            id: Echo::from(&spec.id),
            sha256: Echo::from(&spec.sha256),
        });
    }
    if let Some(hit) = cache.get(&spec.sha256) {
        return Ok(hit);
    }
    let Some(url) = spec.url.as_deref() else {
        return Err(FetchError::MissingNoUrl {
            pack: Echo::from(&spec.pack),
            id: Echo::from(&spec.id),
            path: Echo::from(spec.path.as_path()),
        });
    };
    if mode == Mode::Offline {
        return Err(FetchError::Offline {
            pack: Echo::from(&spec.pack),
            id: Echo::from(&spec.id),
            url: Echo::from(url),
        });
    }
    let bytes = fetch_verified(spec, url, policy, transport)?;
    let path = cache.put(&spec.sha256, &bytes)?;
    report.fetched.push((Echo::from(&spec.id), Echo::from(url)));
    Ok(path)
}

/// Fetches `url` (following policy-checked redirects) and returns bytes that
/// match the pin, or fails.
fn fetch_verified(
    spec: &FaceSpec,
    url: &str,
    policy: &FetchPolicy,
    transport: &dyn Transport,
) -> Result<Vec<u8>, FetchError> {
    let mut current = url.to_string();
    for _ in 0..=MAX_REDIRECTS {
        // Checked for EVERY hop, not just the declared URL: a redirect is
        // attacker-chosen data, so an allowlisted host must not be able to
        // bounce the fetch somewhere untrusted.
        policy
            .check(&current)
            .map_err(|reason| FetchError::Policy {
                pack: Echo::from(&spec.pack),
                id: Echo::from(&spec.id),
                url: Echo::from(&current),
                reason: Echo::from(reason),
            })?;
        match transport.get(&current, MAX_FACE_BYTES) {
            Ok(got) => {
                return if got.sha256 == spec.sha256 {
                    Ok(got.bytes)
                } else {
                    Err(FetchError::Sha256Mismatch {
                        pack: Echo::from(&spec.pack),
                        id: Echo::from(&spec.id),
                        url: Echo::from(&current),
                        expected: Echo::from(&spec.sha256),
                        actual: Echo::from(&got.sha256),
                    })
                };
            }
            Err(TransportError::Redirect(location)) => current = resolve(&current, &location),
            Err(source) => {
                return Err(FetchError::Transport {
                    pack: Echo::from(&spec.pack),
                    id: Echo::from(&spec.id),
                    url: Echo::from(&current),
                    source,
                })
            }
        }
    }
    Err(FetchError::Transport {
        pack: Echo::from(&spec.pack),
        id: Echo::from(&spec.id),
        url: Echo::from(url),
        source: TransportError::TooManyRedirects(MAX_REDIRECTS),
    })
}

/// Resolves a `Location` against the URL it came from. Only the absolute and
/// root-relative forms are handled; anything else is passed through and will
/// fail the policy check, which is the safe direction.
fn resolve(base: &str, location: &str) -> String {
    if location.contains("://") {
        return location.to_string();
    }
    match (location.strip_prefix('/'), base.split_once("://")) {
        (Some(_), Some((scheme, rest))) => {
            let authority = rest.split('/').next().unwrap_or(rest);
            format!("{scheme}://{authority}{location}")
        }
        _ => location.to_string(),
    }
}

#[cfg(test)]
mod tests;
