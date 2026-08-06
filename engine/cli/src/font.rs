//! `shojiku font add` — creating a user font pack on disk.
//!
//! The commercial-font case: a licensed face a user holds is turned into an
//! ordinary font pack (`<font-dir>/<pack>/manifest.yml` + the file), pinned
//! by sha256 exactly as the bundled packs are. Nothing here is
//! system-font scanning — a pack exists because someone ran this command,
//! and it is loaded because a render names it, so what a document was
//! rendered with never depends on what happened to be installed.
//!
//! Both rules a generated pack must satisfy come from the LOADER
//! (`shojiku_layout::{face_sha256, embedding_restricted}`) rather than
//! being restated here: a pack this command writes and the engine then
//! refuses would be the one failure mode a generator exists to prevent.

use shojiku_diagnostics::Echo;
use shojiku_formatter::{FontFaceDecl, PackManifest};
use std::path::PathBuf;
use thiserror::Error;

mod ids;
mod write;

use ids::{check_id, default_face_id, IdKind};

/// Largest font file `font add` will read. Well past any real face
/// (the ~47 MB IPAmj Mincho is the biggest bundled one) and far short of
/// letting a mistyped path pull an arbitrary file into memory.
pub const MAX_FONT_FILE: u64 = 128 * 1024 * 1024;

/// Why a pack could not be written.
///
/// Every field quoting a path, an id, or a parser's message back is an
/// [`Echo`]: these come from the caller's command line and from a manifest
/// that may already be on disk, and they reach a terminal.
#[derive(Debug, Error)]
pub enum FontPackError {
    #[error(
        "`{flag} {id}` is not a valid id (allowed: letters, digits, `-`, `_`; 1-64 characters)"
    )]
    InvalidId { flag: &'static str, id: Echo },
    #[error("`{path}` is not a usable font file name (allowed: letters, digits, `-`, `_`, `.`; no leading dot)")]
    UnusableFileName { path: Echo },
    #[error("failed to read {path}: {source}")]
    Read { path: Echo, source: std::io::Error },
    #[error("failed to write {path}: {source}")]
    Write { path: Echo, source: std::io::Error },
    #[error("{path} is {size} bytes, past the {MAX_FONT_FILE}-byte limit for a font file")]
    TooLarge { path: Echo, size: u64 },
    #[error("{path} does not parse as a font")]
    NotAFont { path: Echo },
    #[error(
        "`{path}` may not be embedded (its OS/2 fsType is Restricted), so the engine would \
         refuse to render with it. Pass --embedding-attested only if you hold a separate \
         embedding licence for this font."
    )]
    EmbeddingRestricted { path: Echo },
    #[error("font pack `{pack}` already declares a face `{id}`")]
    DuplicateFace { pack: Echo, id: Echo },
    #[error("font pack `{pack}` already has a different `{file}`")]
    FileExists { pack: Echo, file: Echo },
    #[error("failed to parse the existing font pack manifest {path}: {detail}")]
    ParseExisting { path: Echo, detail: Echo },
    #[error("font pack `{pack}` already declares licence `{existing}`, not `{added}` (one licence per pack — put a differently-licensed face in its own pack)")]
    LicenseMismatch {
        pack: Echo,
        existing: Echo,
        added: Echo,
    },
}

/// What `font add` wrote, for the caller's confirmation line.
#[derive(Debug)]
pub struct AddedFace {
    /// The pack directory that now holds the face.
    pub pack_dir: PathBuf,
    /// The pack id, i.e. what `--font-pack` must name to load it.
    pub pack: String,
    /// The face id written into the manifest.
    pub face_id: String,
    /// The family a template's `fontFamily` names.
    pub family: String,
    /// Whether the pack now records an embedding attestation.
    pub embedding_attested: bool,
}

/// Adds one font file to a pack, creating the pack when it does not exist.
///
/// Ordering is deliberate: every id and the file itself are checked BEFORE
/// anything is written, so a refused invocation leaves the tree exactly as
/// it found it — including the case where the pack directory did not exist,
/// which is not created until the face is known to be addable.
pub fn run_font_add(args: &crate::FontAddArgs) -> Result<AddedFace, crate::CliError> {
    Ok(add_face(args)?)
}

fn add_face(args: &crate::FontAddArgs) -> Result<AddedFace, FontPackError> {
    let family = args.family.as_str();
    check_id(family, IdKind::Family)?;
    let pack = args.pack.as_deref().unwrap_or(family);
    check_id(pack, IdKind::Pack)?;

    let weight = args.weight.into();
    let style = args.style.into();
    let face_id = match args.face_id.as_deref() {
        Some(id) => id.to_string(),
        None => default_face_id(family, weight, style),
    };
    check_id(&face_id, IdKind::Face)?;

    let file = ids::face_file_name(&args.file)?;
    let bytes = write::read_font(&args.file)?;
    // The loader's own rule, asked at generation time: a face the engine
    // would refuse is refused here, where the user can still do something
    // about it, instead of at the first render.
    if !args.embedding_attested && shojiku_layout::embedding_restricted(&bytes) {
        return Err(FontPackError::EmbeddingRestricted {
            path: Echo::from(args.file.as_path()),
        });
    }

    let decl = FontFaceDecl {
        id: face_id.clone(),
        file: file.clone(),
        sha256: shojiku_layout::face_sha256(&bytes),
        url: args.url.clone(),
        // `family` is skipped when it equals the id, matching how the
        // bundled manifests are written and keeping the generated file free
        // of a key that says nothing.
        family: (family != face_id).then(|| family.to_string()),
        weight: (weight != shojiku_core::FontWeight::default()).then_some(weight),
        style: (style != shojiku_core::FontStyle::default()).then_some(style),
    };

    let dir = write::pack_dir(args, pack);
    let manifest = merge(&dir, pack, decl, args)?;
    write::commit(&dir, pack, &manifest, &file, &bytes, args)?;

    Ok(AddedFace {
        pack_dir: dir,
        pack: pack.to_string(),
        face_id,
        family: family.to_string(),
        embedding_attested: manifest.embedding_attested,
    })
}

/// The manifest the pack should end up with: the existing one plus this
/// face, or a fresh one. A face is APPENDED, so declaration order records
/// the order the user added them and an earlier face's bytes are never
/// disturbed.
fn merge(
    dir: &std::path::Path,
    pack: &str,
    decl: FontFaceDecl,
    args: &crate::FontAddArgs,
) -> Result<PackManifest, FontPackError> {
    let Some(mut manifest) = write::read_manifest(dir)? else {
        return Ok(PackManifest {
            version: 1,
            license: args.license.clone(),
            redistributable: args.redistributable,
            embedding_attested: args.embedding_attested,
            faces: vec![decl],
        });
    };
    if manifest.faces.iter().any(|f| f.id == decl.id) {
        return Err(FontPackError::DuplicateFace {
            pack: Echo::from(pack),
            id: Echo::from(&decl.id),
        });
    }
    if manifest.license != args.license {
        return Err(FontPackError::LicenseMismatch {
            pack: Echo::from(pack),
            existing: Echo::from(&manifest.license),
            added: Echo::from(&args.license),
        });
    }
    // The pack-level flags are claims about the pack, so a later face may
    // only widen them — never silently drop an attestation an earlier face
    // needed.
    manifest.redistributable |= args.redistributable;
    manifest.embedding_attested |= args.embedding_attested;
    manifest.faces.push(decl);
    Ok(manifest)
}

#[cfg(test)]
mod tests;
