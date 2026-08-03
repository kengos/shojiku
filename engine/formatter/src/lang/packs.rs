//! Font-pack resolution: find each `uses` pack's `manifest.yml` across the
//! font search dirs, confine face paths to the pack dir, and merge faces
//! into one ordered list. Earlier packs (and earlier search dirs) win on a
//! duplicate face id, so a user/override pack shadows a bundled one.

use super::{FaceSpec, LangPack, PackManifest};
use shojiku_diagnostics::Echo;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use thiserror::Error;

/// Font-pack resolution failures.
///
/// Every field quoting the manifest back — pack ids, face ids, paths, and
/// the serde message that names the offending key — is an [`Echo`]: a
/// manifest is untrusted input, and these messages reach a terminal. The
/// `std::io::Error` sources stay typed, because their text is written by the
/// OS rather than by the document.
#[derive(Debug, Error)]
pub enum PackError {
    #[error("font pack `{0}` not found in any font dir")]
    NotFound(Echo),
    #[error("failed to read font pack manifest {path}: {source}")]
    Io { path: Echo, source: std::io::Error },
    #[error("failed to parse font pack manifest {path}: {detail}")]
    Parse { path: Echo, detail: Echo },
    #[error("font pack `{pack}` face `{id}` file escapes the pack directory")]
    Traversal { pack: Echo, id: Echo },
    #[error("failed to parse injected font pack manifest for `{pack}`: {detail}")]
    ParseInjected { pack: Echo, detail: Echo },
    #[error("injected font pack `{pack}` face `{id}` bytes not provided")]
    MissingBytes { pack: Echo, id: Echo },
}

/// Resolves the locale's `uses` packs into an ordered, deduped list of
/// [`FaceSpec`]s. For each pack id, the first font dir holding
/// `<dir>/<id>/manifest.yml` wins.
pub fn resolve_face_specs(
    pack: &LangPack,
    font_dirs: &[PathBuf],
) -> Result<Vec<FaceSpec>, PackError> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for pack_id in pack.font_pack_ids() {
        let (manifest, pack_dir) = load_pack(pack_id, font_dirs)?;
        for face in &manifest.faces {
            confine(&face.file, pack_id, &face.id)?;
        }
        for spec in manifest.face_specs(pack_id, &pack_dir) {
            if seen.insert(spec.id.clone()) {
                out.push(spec);
            }
        }
    }
    Ok(out)
}

fn load_pack(pack_id: &str, font_dirs: &[PathBuf]) -> Result<(PackManifest, PathBuf), PackError> {
    for dir in font_dirs {
        let pack_dir = dir.join(pack_id);
        let manifest_path = pack_dir.join("manifest.yml");
        match std::fs::read_to_string(&manifest_path) {
            Ok(content) => {
                let manifest = serde_yaml::from_str(&content).map_err(|err| PackError::Parse {
                    path: Echo::from(manifest_path.as_path()),
                    detail: Echo::from(err.to_string()),
                })?;
                return Ok((manifest, pack_dir));
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(source) => {
                return Err(PackError::Io {
                    path: Echo::from(manifest_path.as_path()),
                    source,
                })
            }
        }
    }
    Err(PackError::NotFound(Echo::from(pack_id)))
}

/// Rejects a manifest `file` that would escape its pack dir — an absolute
/// path (which `join` makes replace the base) or one climbing out with
/// `..`. Only the manifest-declared relative `file` is untrusted; the
/// search-dir prefix may legitimately contain `..`, so it is not examined.
fn confine(file: &str, pack: &str, id: &str) -> Result<(), PackError> {
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

mod bytes;
pub use bytes::{
    resolve_face_bytes, resolve_face_bytes_subset, FaceBytes, InjectedPack, SubsetFaces,
};

#[cfg(test)]
mod tests;
