//! Path confinement for font-pack resolution: what a pack id may look
//! like, and what a manifest's `file` may point at. A manifest and the
//! locale pack naming it are untrusted input, so both the lexical check
//! (shared with the bytes-first resolver, which has no filesystem) and the
//! filesystem containment check (symlinks resolved) live here.

use super::PackError;
use crate::lang::{valid_pack_id, MAX_PACK_ID};
use shojiku_diagnostics::Echo;
use std::path::{Component, Path};

/// Rejects a pack id that is not a single, plain path segment. The wire
/// already rejects one at parse time ([`valid_pack_id`]); this is the
/// resolvers' own check, because `LocaleFonts.uses` is a public field a
/// caller can fill without going through serde.
pub(super) fn check_pack_id(pack_id: &str) -> Result<(), PackError> {
    if valid_pack_id(pack_id) {
        return Ok(());
    }
    Err(PackError::InvalidPackId(Echo::clipped_to(
        pack_id,
        MAX_PACK_ID,
    )))
}

/// Rejects a manifest `file` that would escape its pack dir — an absolute
/// path (which `join` makes replace the base) or one climbing out with
/// `..`. Only the manifest-declared relative `file` is untrusted; the
/// search-dir prefix may legitimately contain `..`, so it is not examined.
///
/// Lexical only, so the bytes-first resolver — which never touches a
/// filesystem — applies exactly the same rule to its lookup keys. The
/// filesystem path additionally runs [`contained`].
pub(super) fn confine(file: &str, pack: &str, id: &str) -> Result<(), PackError> {
    let p = Path::new(file);
    let escapes = p.is_absolute() || p.components().any(|c| matches!(c, Component::ParentDir));
    if escapes {
        return Err(PackError::Traversal {
            pack: Echo::from(pack),
            id: Echo::from(id),
        });
    }
    Ok(())
}

/// Confines a resolved face path to `pack_dir` with symlinks followed —
/// the check [`confine`] cannot make, since a link inside the pack dir is
/// lexically clean and still reads a file anywhere on the host.
/// `pack_dir` is already canonical (the resolver builds it from a
/// canonicalized search dir and a non-symlink pack directory).
///
/// An **absent** face is not an error: a pack may travel as a pinned
/// reference whose files a host fetch layer fills in later, so there is
/// nothing to resolve and nothing yet readable. What remains is a race
/// between this check and the read, and it is benign — the loader
/// sha256-verifies the bytes it actually read, so a swapped target is a
/// hash mismatch rather than a silent substitution.
pub(super) fn contained(
    pack_dir: &Path,
    path: &Path,
    pack: &str,
    id: &str,
) -> Result<(), PackError> {
    if std::fs::symlink_metadata(path).is_err() {
        return Ok(());
    }
    let full = path.canonicalize().map_err(|source| PackError::Io {
        path: Echo::from(path),
        source,
    })?;
    if full.starts_with(pack_dir) {
        return Ok(());
    }
    Err(PackError::Traversal {
        pack: Echo::from(pack),
        id: Echo::from(id),
    })
}
