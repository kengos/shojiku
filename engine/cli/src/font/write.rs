//! The filesystem half of `font add`: reading the source face, reading any
//! existing manifest, and committing both files.
//!
//! Nothing here decides anything — the module root has already settled every
//! id, the licence and the attestation by the time `commit` runs — so a
//! refused invocation never reaches this file at all.

use super::{FontPackError, MAX_FONT_FILE};
use shojiku_authoring::fs::primary_font_dir;
use shojiku_diagnostics::Echo;
use shojiku_formatter::PackManifest;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// The pack directory: `--dir` if given, else the highest-priority font
/// search dir — the one a later render looks in first, since a pack written
/// anywhere else would need `--font-dir` to be found again.
pub(super) fn pack_dir(args: &crate::FontAddArgs, pack: &str) -> PathBuf {
    match &args.dir {
        Some(dir) => dir.join(pack),
        None => primary_font_dir(&[]).join(pack),
    }
}

/// Reads the source font, refusing anything past the size cap or anything
/// that does not parse as a font.
///
/// The size is checked from the file's METADATA first, so an oversized file
/// is refused without being read; the parse check is what stops a pack being
/// created around a file the engine could never load. The bytes come back
/// out of the parsed face rather than being kept alongside it, so the probe
/// costs no copy of what may be a 47 MB file.
pub(super) fn read_font(path: &Path) -> Result<Arc<Vec<u8>>, FontPackError> {
    let meta = std::fs::metadata(path).map_err(|source| FontPackError::Read {
        path: Echo::from(path),
        source,
    })?;
    if meta.len() > MAX_FONT_FILE {
        return Err(FontPackError::TooLarge {
            path: Echo::from(path),
            size: meta.len(),
        });
    }
    let bytes = std::fs::read(path).map_err(|source| FontPackError::Read {
        path: Echo::from(path),
        source,
    })?;
    let face = shojiku_layout::FontFace::from_bytes("probe", bytes).map_err(|_| {
        FontPackError::NotAFont {
            path: Echo::from(path),
        }
    })?;
    Ok(face.data)
}

/// Reads `<dir>/manifest.yml` if the pack already exists.
///
/// A malformed existing manifest is an ERROR rather than a fresh start: the
/// alternative is overwriting a file whose contents nobody could read, which
/// would silently drop faces a user had already added.
pub(super) fn read_manifest(dir: &Path) -> Result<Option<PackManifest>, FontPackError> {
    let path = dir.join("manifest.yml");
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(FontPackError::Read {
                path: Echo::from(path.as_path()),
                source,
            })
        }
    };
    PackManifest::from_yaml(&content)
        .map(Some)
        .map_err(|err| FontPackError::ParseExisting {
            path: Echo::from(path.as_path()),
            detail: Echo::from(err.to_string()),
        })
}

/// Writes the face, the manifest and any licence file.
///
/// The face goes first: a manifest naming a file that is not there yet would
/// be a pack that fails to load if the run died in between, whereas a face
/// with no manifest entry is simply an unreferenced file.
pub(super) fn commit(
    dir: &Path,
    pack: &str,
    manifest: &PackManifest,
    file: &str,
    bytes: &[u8],
    args: &crate::FontAddArgs,
) -> Result<(), FontPackError> {
    create_dir(dir)?;
    let face_path = dir.join(file);
    match std::fs::read(&face_path) {
        // Byte-identical: re-adding the same file under a second face id (a
        // family whose variants share one file) is legitimate.
        Ok(existing) if existing == bytes => {}
        Ok(_) => {
            return Err(FontPackError::FileExists {
                pack: Echo::from(pack),
                file: Echo::from(file),
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => write_file(&face_path, bytes)?,
        Err(source) => {
            return Err(FontPackError::Read {
                path: Echo::from(face_path.as_path()),
                source,
            })
        }
    }
    if let Some(src) = &args.license_file {
        let name = super::ids::face_file_name(src)?;
        let text = std::fs::read(src).map_err(|source| FontPackError::Read {
            path: Echo::from(src.as_path()),
            source,
        })?;
        write_file(&dir.join(name), &text)?;
    }
    write_atomically(&dir.join("manifest.yml"), manifest.to_yaml().as_bytes())
}

/// Writes via a temporary file in the same directory, then renames.
///
/// The manifest is what makes the pack loadable, so a half-written one is
/// worse than none: a rename is atomic within a directory, which means a
/// crash leaves either the previous manifest or the new one.
fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), FontPackError> {
    let tmp = path.with_extension("yml.tmp");
    write_file(&tmp, bytes)?;
    std::fs::rename(&tmp, path).map_err(|source| FontPackError::Write {
        path: Echo::from(path),
        source,
    })
}

fn write_file(path: &Path, bytes: &[u8]) -> Result<(), FontPackError> {
    std::fs::write(path, bytes).map_err(|source| FontPackError::Write {
        path: Echo::from(path),
        source,
    })
}

fn create_dir(dir: &Path) -> Result<(), FontPackError> {
    std::fs::create_dir_all(dir).map_err(|source| FontPackError::Write {
        path: Echo::from(dir),
        source,
    })
}

#[cfg(test)]
mod tests;
