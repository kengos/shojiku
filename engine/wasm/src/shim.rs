//! The wasm-bindgen marshalling shim (wasm32 only): JS strings / `Uint8Array`
//! ↔ the pure [`Session`] core. No engine logic lives here — it only crosses
//! the boundary, so it is never compiled or coverage-gated on the host. A
//! [`WasmError`] becomes a thrown JS `Error`; document diagnostics ride the
//! render result object as data. The value conversions themselves live in the
//! sibling [`marshal`] module; this file is the binding surface.

mod marshal;

use crate::render::PageFormat;
use crate::session::Session;
use marshal::{outcome_to_js, pdf_to_js, throw, to_json};
use wasm_bindgen::prelude::*;

/// The JS-facing engine handle. Fonts/assets/locale are injected once and
/// retained; each render only re-passes the source strings.
#[wasm_bindgen]
pub struct Engine {
    inner: Session,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl Engine {
    /// A fresh engine with no locale, fonts, or assets.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine {
        Engine {
            inner: Session::new(),
        }
    }

    /// The engine capability + version JSON. Static — no session needed.
    pub fn capabilities() -> Result<String, JsValue> {
        crate::capabilities().map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Resolves and stores the locale pack (builtin id, with an optional
    /// overlay/standalone YAML string).
    #[wasm_bindgen(js_name = setLocale)]
    pub fn set_locale(&mut self, id: String, overlay: Option<String>) -> Result<(), JsValue> {
        self.inner
            .set_locale(&id, overlay.as_deref())
            .map_err(throw)
    }

    /// The JSON array of font pack ids this locale needs.
    #[wasm_bindgen(js_name = fontPacksNeeded)]
    pub fn font_packs_needed(&self) -> Result<String, JsValue> {
        let ids = self.inner.font_packs_needed().map_err(throw)?;
        to_json(&ids)
    }

    /// The JSON array of face file names a declared pack's manifest lists —
    /// what the host fetches and injects via `addFontFile`.
    #[wasm_bindgen(js_name = fontFilesNeeded)]
    pub fn font_files_needed(&self, pack_id: String) -> Result<String, JsValue> {
        let files = self.inner.font_files_needed(&pack_id).map_err(throw)?;
        to_json(&files)
    }

    /// The JSON array of `{ file, url? }` a declared pack's manifest lists —
    /// the file-name form plus each face's optional fetch hint, for a host
    /// that must fetch a pinned pack's bytes itself. `url` is omitted when the
    /// manifest carries none.
    #[wasm_bindgen(js_name = fontFacesNeeded)]
    pub fn font_faces_needed(&self, pack_id: String) -> Result<String, JsValue> {
        let faces = self.inner.font_faces_needed(&pack_id).map_err(throw)?;
        to_json(&faces)
    }

    /// Declares an injected font pack by id + its `manifest.yml` source.
    #[wasm_bindgen(js_name = addFontPack)]
    pub fn add_font_pack(&mut self, id: String, manifest: String) {
        self.inner.add_font_pack(id, manifest);
    }

    /// Adds one face file's bytes to a declared pack.
    #[wasm_bindgen(js_name = addFontFile)]
    pub fn add_font_file(
        &mut self,
        pack_id: String,
        file: String,
        bytes: Vec<u8>,
    ) -> Result<(), JsValue> {
        self.inner
            .add_font_file(&pack_id, file, bytes)
            .map_err(throw)
    }

    /// Builds the retained font store from the injected packs (sha256 +
    /// embedding verified).
    #[wasm_bindgen(js_name = loadFonts)]
    pub fn load_fonts(&mut self) -> Result<(), JsValue> {
        self.inner.load_fonts().map_err(throw)
    }

    /// The preview-path load: builds the store from whatever packs are injected
    /// so far and returns the JSON array of the locale's `uses` pack ids that
    /// were absent, so the host can fetch + re-inject them and reload when a
    /// `missing_glyph` diagnostic appears. The primary pack is still required.
    #[wasm_bindgen(js_name = loadFontsSubset)]
    pub fn load_fonts_subset(&mut self) -> Result<String, JsValue> {
        let missing = self.inner.load_fonts_subset().map_err(throw)?;
        to_json(&missing)
    }

    /// Injects one bundled asset's bytes under its template-referenced path.
    #[wasm_bindgen(js_name = addAssetFile)]
    pub fn add_asset_file(&mut self, rel: String, bytes: Vec<u8>) {
        self.inner.add_asset_file(rel, bytes);
    }

    /// Validates the source strings, returning the diagnostics JSON
    /// (`{ "items": [...] }`). Argument order matches the render ops:
    /// template, params, definitions.
    pub fn validate(
        &self,
        template: String,
        params: Option<String>,
        definitions: Option<String>,
    ) -> Result<String, JsValue> {
        let diags = self
            .inner
            .validate(&template, params.as_deref(), definitions.as_deref());
        to_json(&diags)
    }

    /// Renders to PNG pages (the export form): `{ ok, pages: Uint8Array[],
    /// inspect: string|null, diagnostics: string }`. `pageIndex` (0-based,
    /// optional) renders only that page; omit it for every page.
    #[wasm_bindgen(js_name = renderPng)]
    pub fn render_png(
        &self,
        template: String,
        params: String,
        definitions: Option<String>,
        scale: f64,
        page_index: Option<u32>,
    ) -> Result<JsValue, JsValue> {
        self.render(
            PageFormat::Png,
            template,
            params,
            definitions,
            scale,
            page_index,
        )
    }

    /// Renders to raw RGBA pages (the canvas form): `{ ok, pages: { width,
    /// height, rgba: Uint8Array }[], inspect: string|null, diagnostics }`.
    /// `pageIndex` (0-based, optional) renders only that page; omitted, every
    /// page is returned, capped so uncompressed pages cannot exhaust the heap.
    #[wasm_bindgen(js_name = renderRaw)]
    pub fn render_raw(
        &self,
        template: String,
        params: String,
        definitions: Option<String>,
        scale: f64,
        page_index: Option<u32>,
    ) -> Result<JsValue, JsValue> {
        self.render(
            PageFormat::Raw,
            template,
            params,
            definitions,
            scale,
            page_index,
        )
    }

    /// Renders the real PDF deliverable: `{ ok, pdf: Uint8Array, diagnostics:
    /// string }`. Same argument order as the preview ops minus the ones a PDF
    /// has no use for — no `scale` (vector output) and no `pageIndex` (a PDF
    /// is the whole document). A document problem resolves with `ok: false`,
    /// empty bytes and the explaining diagnostics; it never throws.
    #[wasm_bindgen(js_name = renderPdf)]
    pub fn render_pdf(
        &self,
        template: String,
        params: String,
        definitions: Option<String>,
    ) -> Result<JsValue, JsValue> {
        let outcome = self
            .inner
            .render_pdf(&template, &params, definitions.as_deref())
            .map_err(throw)?;
        Ok(pdf_to_js(&outcome)?.into())
    }

    fn render(
        &self,
        format: PageFormat,
        template: String,
        params: String,
        definitions: Option<String>,
        scale: f64,
        page_index: Option<u32>,
    ) -> Result<JsValue, JsValue> {
        let outcome = self
            .inner
            .render(
                format,
                &template,
                &params,
                definitions.as_deref(),
                scale,
                page_index,
            )
            .map_err(throw)?;
        Ok(outcome_to_js(&outcome)?.into())
    }
}
