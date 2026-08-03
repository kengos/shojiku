//! Font-pack manifest + locale font-policy wire types. A **font pack** is
//! a fonts-only bundle (`<pack-id>/manifest.yml` + files) under a font
//! search dir; a **locale** (`packs/locale/<id>.yml`) references packs by
//! id via `uses` and names its default / fallback faces. Face/family ids
//! stay a flat global namespace (the template `fontFamily` contract), so a
//! pack is only physical grouping + integrity/license metadata.

use serde::{Deserialize, Serialize};
use shojiku_core::{FontStyle, FontWeight};
use std::path::PathBuf;

mod pack_id;
pub use pack_id::{valid_pack_id, MAX_PACK_ID};

/// A font pack's `manifest.yml`: the faces it provides plus one license and
/// the integrity metadata (`version` is the schema version, forward-compat
/// for the GUI font-upload flow).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackManifest {
    pub version: u32,
    /// License id of every face in the pack (e.g. `OFL-1.1`, `IPA-1.0`).
    /// One license per pack — mixed-license fonts split into two packs.
    pub license: String,
    /// May the faces be redistributed (bundled into images/tarballs)?
    /// `false` = hash-pinned, host-provided only. Skipped when unset so a
    /// generated manifest carries only the keys its author wrote.
    #[serde(default, skip_serializing_if = "is_false")]
    pub redistributable: bool,
    /// Attests a separately-held embedding license, bypassing the OS/2
    /// `fsType` embedding-rights guard (fsType cannot express purchased
    /// embed rights). Default false.
    #[serde(default, skip_serializing_if = "is_false")]
    pub embedding_attested: bool,
    pub faces: Vec<FontFaceDecl>,
}

/// One face in a pack manifest. `file` is relative to the pack directory;
/// `sha256` is verified against the file bytes at load (tamper/corruption).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FontFaceDecl {
    pub id: String,
    pub file: String,
    /// Lowercase-hex SHA-256 of the font file, verified at load.
    pub sha256: String,
    /// Where a host MAY fetch this face when `file` is absent locally — a
    /// **hint only**. `sha256` stays the guarantee: fetched bytes match it
    /// exactly or the load fails loudly, never a silent fallback. The engine
    /// itself never fetches (no network I/O in the render path); a host layer
    /// fills its cache before render.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// The font family this face belongs to (CSS `font-family`).
    /// Faces sharing a family are variant-selected by `weight`/`style`.
    /// Defaults to `id`, so a single-face family keeps addressing by id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub family: Option<String>,
    /// This face's weight; `fontWeight: bold` selects the family's `bold`
    /// face when present (else synthetic bold). Defaults to `normal`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<FontWeight>,
    /// This face's slant; `fontStyle: italic` selects the family's
    /// `italic` face when present (else synthetic). Defaults to `normal`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<FontStyle>,
}

/// A locale's `fonts:` policy (in `packs/locale/<id>.yml`): which packs to
/// load and which faces are default / fallback. References only — the faces
/// themselves live in the packs named by `uses`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocaleFonts {
    /// Font pack ids to load and merge (earlier wins on a duplicate id, so
    /// a user/override pack shadows a bundled one). Each entry is a single
    /// path segment ([`valid_pack_id`]) — an invalid one fails the parse.
    #[serde(deserialize_with = "pack_id::deserialize_uses")]
    pub uses: Vec<String>,
    pub default: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback: Vec<String>,
}

/// A face resolved for loading: id, absolute path, variant keys (defaults
/// applied — `family` = `id`, `weight`/`style` = `normal`), the expected
/// sha256, and whether the pack attests embedding rights.
#[derive(Debug, Clone)]
pub struct FaceSpec {
    pub id: String,
    pub path: PathBuf,
    pub family: String,
    pub weight: FontWeight,
    pub style: FontStyle,
    pub sha256: String,
    pub embedding_attested: bool,
    /// The manifest's fetch hint, carried through so a host fetch layer sees
    /// it without re-reading manifests. The pack this face came from
    /// (for error messages a user can act on).
    pub url: Option<String>,
    pub pack: String,
}

/// `skip_serializing_if` predicate for the manifest's default-false flags.
fn is_false(b: &bool) -> bool {
    !*b
}

impl FontFaceDecl {
    /// Variant keys with defaults applied: `family` = `id`, `weight`/`style`
    /// = `normal`. Shared by the filesystem and bytes-first resolvers so
    /// they agree on the effective variant of every declared face.
    pub(crate) fn variant(&self) -> (String, FontWeight, FontStyle) {
        (
            self.family.clone().unwrap_or_else(|| self.id.clone()),
            self.weight.unwrap_or_default(),
            self.style.unwrap_or_default(),
        )
    }
}

impl PackManifest {
    /// Resolved faces of this pack, files joined onto `pack_dir` and
    /// variant defaults applied, in declaration order.
    pub fn face_specs(&self, pack_id: &str, pack_dir: &std::path::Path) -> Vec<FaceSpec> {
        self.faces
            .iter()
            .map(|f| {
                let (family, weight, style) = f.variant();
                FaceSpec {
                    id: f.id.clone(),
                    path: pack_dir.join(&f.file),
                    family,
                    weight,
                    style,
                    sha256: f.sha256.clone(),
                    embedding_attested: self.embedding_attested,
                    url: f.url.clone(),
                    pack: pack_id.to_string(),
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests;
