//! The pure session core: injected fonts/assets/locale accumulated ONCE and
//! retained across renders (bytes cross the boundary a single time; the
//! `FontStore` is built once). Render/validate live in the sibling `render`
//! module; this file owns state and the host-misuse error type.

use crate::error::WasmError;
use serde::Serialize;
use shojiku_formatter::{InjectedPack, LangPack, PackManifest};
use shojiku_layout::FontStore;
use std::collections::BTreeMap;

/// One face a declared pack's manifest lists: the `file` name to inject it
/// under, plus the manifest's optional `url` fetch hint. The hint lets a host
/// that does NOT ship a pack's bytes (a pinned-reference pack) fetch them; the
/// sha256 stays engine-side, so a host can never skip verification by reading
/// this. Absent `url` = the host must already hold the bytes.
#[derive(Debug, Clone, Serialize)]
pub struct FaceFile {
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// One injected engine session. Built empty; the host sets a locale, injects
/// font packs + faces + assets, then calls `load_fonts` once. Renders reuse
/// the retained store, so only the source strings change per debounced edit.
#[derive(Default)]
pub struct Session {
    pub(crate) pack: Option<LangPack>,
    pub(crate) font_packs: Vec<InjectedPack>,
    pub(crate) fonts: Option<FontStore>,
    pub(crate) assets: BTreeMap<String, Vec<u8>>,
}

impl Session {
    /// A fresh empty session.
    pub fn new() -> Self {
        Self::default()
    }

    /// Resolves and stores the locale pack: a builtin (with `overlay`
    /// deep-merged per key when present) or a standalone pack parsed from
    /// `overlay`. Never touches a filesystem.
    pub fn set_locale(&mut self, id: &str, overlay: Option<&str>) -> Result<(), WasmError> {
        let pack = shojiku_authoring::load_pack(id, overlay)
            .map_err(|e| WasmError::Locale(e.to_string()))?;
        self.pack = Some(pack);
        Ok(())
    }

    /// The font pack ids this locale needs — the host fetches each pack's
    /// `manifest.yml` + face files and injects them. Needs a locale; the shim
    /// serializes the ids to a JSON array.
    pub fn font_packs_needed(&self) -> Result<Vec<String>, WasmError> {
        let pack = self.pack.as_ref().ok_or(WasmError::LocaleNotSet)?;
        Ok(pack.font_pack_ids().to_vec())
    }

    /// Declares one injected font pack by id + its `manifest.yml` source; the
    /// face bytes are added with [`add_font_file`](Self::add_font_file).
    pub fn add_font_pack(&mut self, id: String, manifest: String) {
        self.font_packs.push(InjectedPack {
            id,
            manifest,
            files: BTreeMap::new(),
        });
    }

    /// The face file names a declared pack's manifest lists — what the host
    /// fetches and injects via [`add_font_file`](Self::add_font_file). Parsed
    /// engine-side so the host never re-parses `manifest.yml` itself (no
    /// second grammar at the boundary).
    pub fn font_files_needed(&self, pack_id: &str) -> Result<Vec<String>, WasmError> {
        Ok(self
            .parse_manifest(pack_id)?
            .faces
            .into_iter()
            .map(|f| f.file)
            .collect())
    }

    /// The same faces as [`font_files_needed`](Self::font_files_needed), each
    /// paired with the manifest's optional `url` fetch hint — what a host that
    /// does not ship a pinned pack's bytes needs in order to fetch them. The
    /// engine parses the manifest so the host never needs a second grammar for
    /// it. Additive beside the file-name form, which stays as it was.
    pub fn font_faces_needed(&self, pack_id: &str) -> Result<Vec<FaceFile>, WasmError> {
        Ok(self
            .parse_manifest(pack_id)?
            .faces
            .into_iter()
            .map(|f| FaceFile {
                file: f.file,
                url: f.url,
            })
            .collect())
    }

    /// Parses a declared pack's `manifest.yml`. An undeclared pack is host
    /// misuse; an unparsable manifest degrades to a `Fonts` error, never a
    /// panic (the source is host-injected and may be hostile).
    fn parse_manifest(&self, pack_id: &str) -> Result<PackManifest, WasmError> {
        let pack = self
            .font_packs
            .iter()
            .find(|p| p.id == pack_id)
            .ok_or_else(|| WasmError::UnknownFontPack(pack_id.to_string()))?;
        // Through `from_yaml`, not `serde_yaml::from_str`: that is the one
        // door carrying the input-size bound, and `add_font_pack(id,
        // manifest)` takes this string straight from JS.
        PackManifest::from_yaml(&pack.manifest).map_err(|e| WasmError::Fonts(e.to_string()))
    }

    /// Adds one face file's bytes to a previously declared pack, keyed by the
    /// manifest `file` string. The bytes cross the boundary once and are
    /// retained until `load_fonts`.
    pub fn add_font_file(
        &mut self,
        pack_id: &str,
        file: String,
        bytes: Vec<u8>,
    ) -> Result<(), WasmError> {
        let pack = self
            .font_packs
            .iter_mut()
            .find(|p| p.id == pack_id)
            .ok_or_else(|| WasmError::UnknownFontPack(pack_id.to_string()))?;
        pack.files.insert(file, bytes);
        Ok(())
    }

    /// Builds the retained [`FontStore`] from the injected packs, verifying
    /// every face's sha256 + embedding rights (identical to the filesystem
    /// path). Consumes the injected packs. Needs a locale.
    pub fn load_fonts(&mut self) -> Result<(), WasmError> {
        let pack = self.pack.as_ref().ok_or(WasmError::LocaleNotSet)?;
        let injected = std::mem::take(&mut self.font_packs);
        let store = FontStore::load_from_injected(pack, injected)
            .map_err(|e| WasmError::Fonts(e.to_string()))?;
        self.fonts = Some(store);
        Ok(())
    }

    /// The browser-preview mirror of [`load_fonts`](Self::load_fonts): builds
    /// the store from whatever font packs are injected so far, SKIPPING any of
    /// the locale's `uses` packs that are absent, and returns the ids of the
    /// skipped packs. A skipped pack's glyphs degrade to a `missing_glyph`
    /// diagnostic; the host fetches it, re-injects the FULL set (it holds the
    /// bytes JS-side), and calls this again to upgrade the store. The primary
    /// (default-face) pack is still required. Consumes the injected packs.
    pub fn load_fonts_subset(&mut self) -> Result<Vec<String>, WasmError> {
        let pack = self.pack.as_ref().ok_or(WasmError::LocaleNotSet)?;
        let injected = std::mem::take(&mut self.font_packs);
        let (store, missing) = FontStore::load_from_injected_subset(pack, injected)
            .map_err(|e| WasmError::Fonts(e.to_string()))?;
        self.fonts = Some(store);
        Ok(missing)
    }

    /// Injects one bundled asset's bytes, keyed by the same relative path the
    /// template references (`src:`/`data:`-selected). The engine confines and
    /// caps it exactly like the filesystem path.
    pub fn add_asset_file(&mut self, rel: String, bytes: Vec<u8>) {
        self.assets.insert(rel, bytes);
    }
}
