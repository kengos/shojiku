//! `FontStore` construction: the two production loaders (filesystem packs
//! and host-injected bytes) plus the test-only `from_faces` shortcut. Both
//! production paths sha256-verify and fsType-check every face and carry the
//! locale fallback chain; they share one `assemble` step so the WASM/MCP
//! bytes path is byte-for-byte the same store as the CLI filesystem path.

use super::{verify, FontError, FontFace, FontStore};
use shojiku_formatter::{
    resolve_face_bytes, resolve_face_bytes_subset, resolve_face_specs, FaceBytes, FaceSpec,
    InjectedPack, LangPack, SubsetFaces,
};
use std::collections::HashMap;
use std::path::PathBuf;

#[cfg(test)]
mod tests;

impl FontStore {
    /// Loads every face the locale's `uses` packs provide, resolving the
    /// packs across `font_dirs` (earlier dirs win). Each face's bytes are
    /// sha256-verified against its manifest and fsType-checked for
    /// embedding rights before it joins the store.
    pub fn load_from_pack(pack: &LangPack, font_dirs: &[PathBuf]) -> Result<Self, FontError> {
        // Checked before resolving so a pack declaring no default face still
        // reports `NoFonts` when the font dirs are ALSO broken — the error
        // precedence this had before resolution and loading were split apart.
        Self::default_id_of(pack)?;
        Self::load_from_specs(resolve_face_specs(pack, font_dirs)?, pack)
    }

    /// Loads already-resolved faces from their `path`s — the tail of
    /// [`load_from_pack`](Self::load_from_pack), split out so a host layer can
    /// sit between resolution and loading (the CLI's font fetch fills its cache
    /// and repoints each spec's `path` before calling this). Verification is
    /// unchanged: every face is still sha256-verified against its manifest and
    /// fsType-checked here, so bytes a host supplied get no weaker treatment.
    pub fn load_from_specs(specs: Vec<FaceSpec>, pack: &LangPack) -> Result<Self, FontError> {
        let default_id = Self::default_id_of(pack)?;
        if specs.is_empty() {
            return Err(FontError::NoFonts(pack.id.clone()));
        }
        let built = specs
            .into_iter()
            .map(|s| {
                let face = FontFace::load(s.id.clone(), &s.path)?
                    .with_variant(s.family, s.weight, s.style);
                Ok((face, s.sha256, s.embedding_attested))
            })
            .collect::<Result<Vec<_>, FontError>>()?;
        Self::assemble(built, default_id, pack.font_fallback().to_vec())
    }

    /// Loads every face from host-injected pack manifests+bytes (browser /
    /// Workers WASM, the MCP server) — the bytes-first mirror of
    /// [`load_from_pack`](Self::load_from_pack). The host fetches and injects
    /// bytes; the same sha256/fsType verification and fallback chain apply,
    /// so a rendered PNG is identical to the filesystem path.
    pub fn load_from_injected(
        pack: &LangPack,
        injected: Vec<InjectedPack>,
    ) -> Result<Self, FontError> {
        let default_id = Self::default_id_of(pack)?;
        let specs = resolve_face_bytes(pack, injected)?;
        Self::build_from_bytes(specs, pack, default_id)
    }

    /// The browser-preview mirror of [`load_from_injected`](Self::load_from_injected):
    /// builds the store from whatever `uses` packs the host has injected so
    /// far, SKIPPING (not failing on) any that are absent, and returns the
    /// ids of the skipped packs so the host can fetch + re-inject them and
    /// reload when a `missing_glyph` diagnostic shows a fetched-too-late
    /// glyph. Only pack *absence* is tolerated — every loaded face is sha256 +
    /// fsType verified identically, and the DEFAULT face's pack is still
    /// required (its absence is `UnknownFace`/`NoFonts`, as on the strict
    /// path — a store needs its primary face). Preview-path only; the
    /// render/sign path uses the strict loaders for the full deterministic chain.
    pub fn load_from_injected_subset(
        pack: &LangPack,
        injected: Vec<InjectedPack>,
    ) -> Result<(Self, Vec<String>), FontError> {
        let default_id = Self::default_id_of(pack)?;
        let SubsetFaces { faces, missing } = resolve_face_bytes_subset(pack, injected)?;
        let store = Self::build_from_bytes(faces, pack, default_id)?;
        Ok((store, missing))
    }

    /// Verifies and assembles a store from already-resolved injected faces —
    /// the shared tail of the strict and subset bytes loaders, so both build a
    /// byte-for-byte identical store from the same faces.
    fn build_from_bytes(
        specs: Vec<FaceBytes>,
        pack: &LangPack,
        default_id: String,
    ) -> Result<Self, FontError> {
        if specs.is_empty() {
            return Err(FontError::NoFonts(pack.id.clone()));
        }
        let built = specs
            .into_iter()
            .map(|s| {
                let face = FontFace::from_bytes(s.id.clone(), s.bytes)?
                    .with_variant(s.family, s.weight, s.style);
                Ok((face, s.sha256, s.embedding_attested))
            })
            .collect::<Result<Vec<_>, FontError>>()?;
        Self::assemble(built, default_id, pack.font_fallback().to_vec())
    }

    /// Builds a store from already-loaded faces (used by tests). No
    /// verification and no fallback chain — the production paths supply both
    /// via [`load_from_pack`](Self::load_from_pack) /
    /// [`load_from_injected`](Self::load_from_injected), so this stays
    /// out of every host-facing (CLI/WASM/MCP) surface.
    pub fn from_faces(faces: Vec<FontFace>, default_id: &str) -> Result<Self, FontError> {
        let order: Vec<String> = faces.iter().map(|f| f.id.clone()).collect();
        let map: HashMap<String, FontFace> = faces.into_iter().map(|f| (f.id.clone(), f)).collect();
        if !map.contains_key(default_id) {
            return Err(FontError::UnknownFace(default_id.to_string()));
        }
        Ok(Self {
            faces: map,
            order,
            default_id: default_id.to_string(),
            fallback: Vec::new(),
        })
    }

    /// The locale's declared default face, or `NoFonts` if it declares none.
    fn default_id_of(pack: &LangPack) -> Result<String, FontError> {
        pack.default_font()
            .map(str::to_string)
            .ok_or_else(|| FontError::NoFonts(pack.id.clone()))
    }

    /// Verifies each `(face, sha256, embedding_attested)` and assembles the
    /// store, rejecting a `default_id` absent from the loaded faces.
    fn assemble(
        built: Vec<(FontFace, String, bool)>,
        default_id: String,
        fallback: Vec<String>,
    ) -> Result<Self, FontError> {
        let mut faces = HashMap::new();
        let mut order = Vec::new();
        for (face, sha256, embedding_attested) in built {
            verify::verify_face(&face, &sha256, embedding_attested)?;
            order.push(face.id.clone());
            faces.insert(face.id.clone(), face);
        }
        if !faces.contains_key(&default_id) {
            return Err(FontError::UnknownFace(default_id));
        }
        Ok(Self {
            faces,
            order,
            default_id,
            fallback,
        })
    }
}
