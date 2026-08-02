//! Bundled-asset byte loading from either a filesystem directory (the CLI /
//! MCP hosts) or host-injected bytes (the WASM host). The traversal
//! confinement (`..`, absolute, prefix, root all rejected) is shared so both
//! roots reject an identical hostile path, and both enforce the same
//! `max_asset_bytes` cap before the bytes reach `kind_from_bytes`.

use crate::error::ImageError;
use crate::policy::AssetPolicy;
use std::collections::BTreeMap;
use std::path::{Component, Path};

/// Where bundled `src:` / `data:`-selected paths resolve from. FS hosts pass
/// [`Dir`](AssetsRoot::Dir); a bytes-injecting host (WASM) passes
/// [`Injected`](AssetsRoot::Injected) with a map keyed by the same relative
/// path the template references (`.` segments dropped, `/`-joined).
#[derive(Clone, Copy)]
pub(super) enum AssetsRoot<'a> {
    /// No bundled sources configured; a bundled reference errors
    /// (`assets_root_missing`).
    None,
    /// Resolve bundled paths against this filesystem directory.
    Dir(&'a Path),
    /// Resolve bundled paths against host-injected bytes.
    Injected(&'a BTreeMap<String, Vec<u8>>),
}

/// The confined lookup key for `rel`: its `Normal` components joined by `/`
/// (`.` dropped), or [`Traversal`](ImageError::Traversal) if any component is
/// absolute, a prefix, root, or `..`. Shared with the filesystem loader's own
/// component check so an injected host rejects the same paths.
fn confined_key(rel: &str) -> Result<String, ImageError> {
    let mut parts = Vec::new();
    for component in Path::new(rel).components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            Component::CurDir => {}
            _ => return Err(ImageError::Traversal(rel.to_string())),
        }
    }
    Ok(parts.join("/"))
}

/// Reads a bundled asset from the configured root, enforcing the byte cap.
/// `AssetsRoot::None` is the caller's `assets_root_missing` case and never
/// reaches here.
pub(super) fn load_bytes(
    root: &AssetsRoot<'_>,
    rel: &str,
    policy: &AssetPolicy,
) -> Result<Vec<u8>, ImageError> {
    match root {
        AssetsRoot::None => Err(ImageError::Missing(rel.to_string())),
        AssetsRoot::Dir(dir) => load_confined(dir, rel, policy),
        AssetsRoot::Injected(map) => load_injected(map, rel, policy),
    }
}

/// Reads a bundled asset from the filesystem, confining the path to the root
/// (rejects absolute paths, `..`, and symlinks escaping the root) and
/// enforcing the byte cap before reading.
fn load_confined(root: &Path, rel: &str, policy: &AssetPolicy) -> Result<Vec<u8>, ImageError> {
    // Reject a hostile path before touching the filesystem (parity with the
    // injected loader); canonicalize below still catches symlink escapes.
    confined_key(rel)?;
    let candidate = Path::new(rel);
    let io_err = |p: &Path| {
        let path = p.display().to_string();
        move |source: std::io::Error| ImageError::Io { path, source }
    };
    let root_canonical = root.canonicalize().map_err(io_err(root))?;
    let joined = root_canonical.join(candidate);
    let full = joined.canonicalize().map_err(io_err(&joined))?;
    if !full.starts_with(&root_canonical) {
        return Err(ImageError::Traversal(rel.to_string()));
    }
    let len = std::fs::metadata(&full).map_err(io_err(&full))?.len();
    if len > policy.max_asset_bytes as u64 {
        return Err(ImageError::TooLarge {
            len: len as usize,
            cap: policy.max_asset_bytes,
        });
    }
    std::fs::read(&full).map_err(io_err(&full))
}

/// Looks a bundled asset up in the host-injected byte map, confining the key
/// and enforcing the byte cap — the no-filesystem mirror of [`load_confined`].
fn load_injected(
    map: &BTreeMap<String, Vec<u8>>,
    rel: &str,
    policy: &AssetPolicy,
) -> Result<Vec<u8>, ImageError> {
    let key = confined_key(rel)?;
    let bytes = map
        .get(&key)
        .ok_or_else(|| ImageError::Missing(rel.to_string()))?;
    if bytes.len() > policy.max_asset_bytes {
        return Err(ImageError::TooLarge {
            len: bytes.len(),
            cap: policy.max_asset_bytes,
        });
    }
    Ok(bytes.clone())
}

#[cfg(test)]
mod tests;
