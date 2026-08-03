//! Bytes-first font-pack resolution: the host injects each `uses` pack's
//! `manifest.yml` source plus the bytes of the face files it declares
//! (browser/Workers WASM, the MCP server), and this parses/confines/dedupes
//! them into loadable specs exactly like the filesystem resolver — no
//! directory walk, no file reads. sha256 verification stays downstream (the
//! layout `FontStore`), so a bad face is caught the same way on both paths.

use super::{confine, PackError};
use crate::lang::{LangPack, PackManifest};
use shojiku_core::{FontStyle, FontWeight};
use shojiku_diagnostics::Echo;
use std::collections::{BTreeMap, HashSet};

/// One host-injected font pack: the `manifest.yml` source and the bytes of
/// each face file it declares, keyed by the manifest `file` string (what the
/// host fetched). The host builds one of these per `uses` pack id.
pub struct InjectedPack {
    pub id: String,
    pub manifest: String,
    /// Face file name (manifest `file`) → the fetched font bytes.
    pub files: BTreeMap<String, Vec<u8>>,
}

/// A face resolved from injected bytes: the same variant/integrity metadata
/// as [`FaceSpec`](super::super::FaceSpec) but carrying the font bytes
/// directly instead of a filesystem path.
#[derive(Debug)]
pub struct FaceBytes {
    pub id: String,
    pub bytes: Vec<u8>,
    pub family: String,
    pub weight: FontWeight,
    pub style: FontStyle,
    pub sha256: String,
    pub embedding_attested: bool,
}

/// Faces resolved from a SUBSET of the locale's `uses` packs, plus the ids of
/// the packs the host had not injected yet. The browser preview path loads
/// whatever packs it has fetched so far; a `missing` pack's glyphs degrade to
/// the `missing_glyph` diagnostic until the host fetches, re-injects, and
/// reloads. Only pack *absence* is lenient — every injected pack is parsed,
/// confined and sha256-verified exactly as on the strict path.
#[derive(Debug)]
pub struct SubsetFaces {
    /// The resolved faces, in the same order/dedup as [`resolve_face_bytes`].
    pub faces: Vec<FaceBytes>,
    /// The `uses` pack ids that were not injected (in `uses` order, deduped).
    pub missing: Vec<String>,
}

/// Resolves the locale's `uses` packs from host-injected manifests+bytes
/// into an ordered, deduped list of [`FaceBytes`]. First `uses` pack (and,
/// within it, first face id) wins on a duplicate id — and the FIRST injected
/// pack wins on a duplicate pack id — matching
/// [`resolve_face_specs`](super::resolve_face_specs)' first-dir-wins rule so
/// a user/override pack shadows a bundled one identically on both paths.
/// A duplicate `uses` entry is processed once (the FS resolver re-reads the
/// manifest and its faces dedupe to nothing; here the walk skips it — same
/// outcome, and the single injection must not be consumed twice).
/// Every `uses` pack MUST be injected (the render/export path needs the full
/// chain for a deterministic render); a missing one is [`PackError::NotFound`].
pub fn resolve_face_bytes(
    pack: &LangPack,
    injected: Vec<InjectedPack>,
) -> Result<Vec<FaceBytes>, PackError> {
    let mut by_id = index_injected(injected);
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut done = HashSet::new();
    for pack_id in pack.font_pack_ids() {
        if !done.insert(pack_id.as_str()) {
            continue;
        }
        let inj = by_id
            .remove(pack_id)
            .ok_or_else(|| PackError::NotFound(Echo::from(pack_id.as_str())))?;
        resolve_pack(pack_id, inj, &mut seen, &mut out)?;
    }
    Ok(out)
}

/// The browser-preview mirror of [`resolve_face_bytes`]: resolves whatever
/// `uses` packs the host has injected so far and REPORTS the absent ones in
/// [`SubsetFaces::missing`] instead of failing. Only absence is tolerated —
/// a malformed manifest, missing declared bytes, or a `../` traversal in an
/// injected pack still fails loudly, so font integrity is unchanged. An
/// injected pack the locale does not `uses` is ignored (never "missing"),
/// and a duplicate `uses` entry is processed once — a loaded pack is never
/// reported missing (which would send the host refetching a pack it has),
/// and an absent one is reported once, not per occurrence.
pub fn resolve_face_bytes_subset(
    pack: &LangPack,
    injected: Vec<InjectedPack>,
) -> Result<SubsetFaces, PackError> {
    let mut by_id = index_injected(injected);
    let mut faces = Vec::new();
    let mut missing = Vec::new();
    let mut seen = HashSet::new();
    let mut done = HashSet::new();
    for pack_id in pack.font_pack_ids() {
        if !done.insert(pack_id.as_str()) {
            continue;
        }
        match by_id.remove(pack_id) {
            Some(inj) => resolve_pack(pack_id, inj, &mut seen, &mut faces)?,
            None => missing.push(pack_id.to_string()),
        }
    }
    Ok(SubsetFaces { faces, missing })
}

/// Indexes injected packs by id, first-injection-wins (mirroring the
/// filesystem first-dir-wins user-pack shadow).
fn index_injected(injected: Vec<InjectedPack>) -> BTreeMap<String, InjectedPack> {
    let mut by_id: BTreeMap<String, InjectedPack> = BTreeMap::new();
    for p in injected {
        by_id.entry(p.id.clone()).or_insert(p);
    }
    by_id
}

/// Parses, confines, dedupes and byte-pairs ONE injected pack, appending its
/// winning faces to `out`. `seen` carries the first-id-wins set ACROSS packs
/// so an earlier pack shadows a later duplicate id — shared by the strict and
/// subset walks so they resolve identically face-for-face.
fn resolve_pack(
    pack_id: &str,
    mut inj: InjectedPack,
    seen: &mut HashSet<String>,
    out: &mut Vec<FaceBytes>,
) -> Result<(), PackError> {
    let manifest: PackManifest =
        serde_yaml::from_str(&inj.manifest).map_err(|err| PackError::ParseInjected {
            pack: Echo::from(pack_id),
            detail: Echo::from(err.to_string()),
        })?;
    // Confine every declared file first (defense-in-depth: `file` is a
    // lookup key here, but keeping parity with the filesystem path means
    // a hostile `../` manifest is rejected identically), then dedupe and
    // pair bytes only for the faces that actually win.
    for face in &manifest.faces {
        confine(&face.file, pack_id, &face.id)?;
    }
    let mut winners = Vec::new();
    for face in &manifest.faces {
        if seen.insert(face.id.clone()) {
            winners.push(face);
        }
    }
    // Faces may share one file (the filesystem path reads it once per
    // face): count the winners per file so earlier users clone and only
    // the last takes the bytes out of the map.
    let mut refs: BTreeMap<&str, usize> = BTreeMap::new();
    for face in &winners {
        *refs.entry(face.file.as_str()).or_insert(0) += 1;
    }
    for face in winners {
        let bytes = match refs.get_mut(face.file.as_str()) {
            Some(n) if *n > 1 => {
                *n -= 1;
                inj.files.get(&face.file).cloned()
            }
            _ => inj.files.remove(&face.file),
        }
        .ok_or_else(|| PackError::MissingBytes {
            pack: Echo::from(pack_id),
            id: Echo::from(&face.id),
        })?;
        let (family, weight, style) = face.variant();
        out.push(FaceBytes {
            id: face.id.clone(),
            bytes,
            family,
            weight,
            style,
            sha256: face.sha256.clone(),
            embedding_attested: manifest.embedding_attested,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests;
