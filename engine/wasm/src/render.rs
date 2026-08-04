//! Validate + render over the injected [`Session`]. Both wrap the shared
//! authoring ops and return Rust-typed results; JSON serialization is the
//! shim's marshalling job (so it stays in the wasm-only layer, not the
//! host-covered core). Render returns the three parts — pages + the prepared
//! doc (for the inspect envelope) + diagnostics — and never throws on a
//! document problem: a parse/validation failure comes back with empty pages,
//! no prepared doc, and the diagnostics that explain it.
//!
//! The PDF op ([`Session::render_pdf`]) rides the SAME stage and composes
//! `shojiku-render-pdf` on top, exactly as the CLI does — so the bytes a
//! browser downloads are the bytes the CLI writes.

use crate::error::WasmError;
use crate::session::Session;
use shojiku_authoring::{
    load_sources, prepare, preview_page, preview_page_raw, preview_pages, preview_raw, AssetsInput,
    PrepareCtx, Prepared, RawPage,
};
use shojiku_diagnostics::Diagnostics;
use shojiku_formatter::LangPack;
use shojiku_image::AssetPolicy;
use shojiku_layout::FontStore;

/// The most pages an all-pages RAW render returns before the host must select
/// a page. Raw pages are uncompressed and accumulate in the wasm heap before
/// crossing to JS, so a legal-but-large document (layout's page cap × A4 at
/// scale 2 ≈ 8 MB/page) can OOM the module. The PNG form encodes and drops
/// each page, so it stays uncapped. Mirrors the MCP preview-page response cap.
pub(crate) const MAX_RAW_PAGES: usize = 20;

/// Which preview form a render produces.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageFormat {
    /// PNG-encoded bytes per page (the export/download form).
    Png,
    /// Raw un-premultiplied RGBA per page (the canvas form).
    Raw,
}

/// The rendered pages in the requested form.
pub enum Pages {
    /// PNG bytes per page.
    Png(Vec<Vec<u8>>),
    /// Raw RGBA pixels per page.
    Raw(Vec<RawPage>),
}

impl Pages {
    /// The empty page set for `format` (a document error renders no pages).
    fn empty(format: PageFormat) -> Self {
        match format {
            PageFormat::Png => Pages::Png(Vec::new()),
            PageFormat::Raw => Pages::Raw(Vec::new()),
        }
    }
}

/// A finished PDF render: the bytes, the prepared document (`Some` → the
/// render reached layout; `None` when a parse/validation error stopped it),
/// and the diagnostics. The inspect envelope is deliberately NOT part of this
/// bundle — it is a canvas concern the preview loop already holds fresh, and
/// serializing the box index per export would be pure cost.
pub struct PdfOutcome {
    /// The PDF bytes (empty on a document error).
    pub pdf: Vec<u8>,
    /// The laid-out document, or `None` when a document error stopped layout.
    pub prepared: Option<Prepared>,
    /// The diagnostics (an error set on failure, surviving warnings on
    /// success).
    pub diagnostics: Diagnostics,
}

/// A finished render, Rust-typed for the shim to serialize: the pages, the
/// prepared document (`Some` → the inspect envelope; `None` when a
/// parse/validation error produced none), and the diagnostics (errors on
/// failure, surviving warnings on success). Always the three-part bundle.
pub struct RenderOutcome {
    /// The rendered pages (empty on a document error).
    pub pages: Pages,
    /// The laid-out document for the inspect envelope, or `None` when a
    /// parse/validation error stopped layout.
    pub prepared: Option<Prepared>,
    /// The diagnostics (an error set on failure, surviving warnings on
    /// success).
    pub diagnostics: Diagnostics,
}

impl Session {
    /// Validates the source strings (no fonts needed), returning the typed
    /// diagnostics — a parse failure surfaces as one `parse_error` diagnostic,
    /// exactly like the CLI/MCP `validate` op. The shim serializes them.
    /// Argument order matches [`render`](Self::render): template, params,
    /// definitions — one ordering across the whole surface.
    pub fn validate(
        &self,
        template: &str,
        params: Option<&str>,
        definitions: Option<&str>,
    ) -> Diagnostics {
        shojiku_authoring::validate_strings(definitions, template, params)
    }

    /// Parses → validates → lays out → rasterizes, returning the three-part
    /// outcome. `page` is an optional 0-based index: `Some` renders only that
    /// page, `None` renders every page (the raw form capped, see
    /// [`MAX_RAW_PAGES`]). Errors are host-API misuse only (thrown in the
    /// shim); a broken document comes back with empty pages + explaining
    /// diagnostics regardless of `page`.
    pub fn render(
        &self,
        format: PageFormat,
        template: &str,
        params: &str,
        definitions: Option<&str>,
        scale: f64,
        page: Option<u32>,
    ) -> Result<RenderOutcome, WasmError> {
        let (pack, fonts) = self.ready()?;
        // The scale gate stays AHEAD of parsing: a host that passes a bad
        // scale hears about the scale, not about the document.
        if !(scale.is_finite() && scale > 0.0) {
            return Err(WasmError::BadScale(scale));
        }

        let prepared = match stage(self, pack, fonts, template, params, definitions) {
            Ok(prepared) => prepared,
            Err(diags) => return Ok(document_error(format, diags)),
        };

        let pages = rasterize(&prepared, fonts, scale, format, page)?;
        let diagnostics = prepared.diagnostics.clone();
        Ok(RenderOutcome {
            pages,
            prepared: Some(prepared),
            diagnostics,
        })
    }

    /// Parses → validates → lays out → writes **PDF** bytes: the real
    /// deliverable, byte-identical to what the CLI writes from the same
    /// inputs. There is no `scale` (PDF is vector) and no page selection (a
    /// PDF is the whole document) — and deliberately no page/size cap of its
    /// own, because a cap the CLI does not apply would make the browser's
    /// download differ from the CLI's; layout's page cap is the bound.
    ///
    /// A broken document comes back with EMPTY bytes plus the diagnostics that
    /// explain it, never a throw; the errors are host-API misuse only.
    pub fn render_pdf(
        &self,
        template: &str,
        params: &str,
        definitions: Option<&str>,
    ) -> Result<PdfOutcome, WasmError> {
        let (pack, fonts) = self.ready()?;
        let prepared = match stage(self, pack, fonts, template, params, definitions) {
            Ok(prepared) => prepared,
            Err(diagnostics) => {
                return Ok(PdfOutcome {
                    pdf: Vec::new(),
                    prepared: None,
                    diagnostics,
                })
            }
        };
        let pdf = shojiku_render_pdf::render_pdf(&prepared.document, fonts, &prepared.assets)
            .map_err(pdf_err)?;
        let diagnostics = prepared.diagnostics.clone();
        Ok(PdfOutcome {
            pdf,
            prepared: Some(prepared),
            diagnostics,
        })
    }

    /// The locale pack + font store, or the typed host-misuse error naming the
    /// first missing setup step. Locale before fonts: that is the setup order
    /// (`set_locale` → `load_fonts`), so a bare session's error names the step
    /// the host actually skipped first.
    fn ready(&self) -> Result<(&LangPack, &FontStore), WasmError> {
        let pack = self.pack.as_ref().ok_or(WasmError::LocaleNotSet)?;
        let fonts = self.fonts.as_ref().ok_or(WasmError::FontsNotLoaded)?;
        Ok((pack, fonts))
    }
}

/// The parse → validate → layout stage both render ops share. A document
/// problem (parse failure or a validation error set) comes back as `Err`
/// carrying the diagnostics that explain it — never a thrown string.
fn stage(
    session: &Session,
    pack: &LangPack,
    fonts: &FontStore,
    template: &str,
    params: &str,
    definitions: Option<&str>,
) -> Result<Prepared, Diagnostics> {
    let sources = load_sources(definitions, template, params).map_err(|err| {
        let mut diags = Diagnostics::default();
        diags.push(err.to_diagnostic());
        diags
    })?;
    let policy = AssetPolicy::default();
    prepare(
        sources,
        PrepareCtx {
            pack,
            fonts,
            assets: AssetsInput::PrepareInjected {
                policy: &policy,
                assets: &session.assets,
            },
        },
    )
}

/// Rasterizes the requested page(s). A `Some(page)` past the last page is a
/// typed [`WasmError::PageOutOfRange`] (range-checked here so the thrown error
/// stays typed without importing the render error into the shim); an all-pages
/// raw render past [`MAX_RAW_PAGES`] is [`WasmError::TooManyRawPages`].
fn rasterize(
    prepared: &Prepared,
    fonts: &shojiku_layout::FontStore,
    scale: f64,
    format: PageFormat,
    page: Option<u32>,
) -> Result<Pages, WasmError> {
    let total = prepared.document.pages.len();
    if let Some(p) = page {
        let index = p as usize;
        if index >= total {
            return Err(WasmError::PageOutOfRange { page: index, total });
        }
        return Ok(match format {
            PageFormat::Png => Pages::Png(vec![
                preview_page(prepared, fonts, scale, index).map_err(render_err)?
            ]),
            PageFormat::Raw => Pages::Raw(vec![
                preview_page_raw(prepared, fonts, scale, index).map_err(render_err)?
            ]),
        });
    }
    match format {
        PageFormat::Png => Ok(Pages::Png(
            preview_pages(prepared, fonts, scale).map_err(render_err)?,
        )),
        PageFormat::Raw if total > MAX_RAW_PAGES => Err(WasmError::TooManyRawPages {
            total,
            cap: MAX_RAW_PAGES,
        }),
        PageFormat::Raw => Ok(Pages::Raw(
            preview_raw(prepared, fonts, scale).map_err(render_err)?,
        )),
    }
}

/// Maps a rasterization failure to the host error type.
fn render_err(err: shojiku_render_png::RenderPngError) -> WasmError {
    WasmError::Render(err.to_string())
}

/// Maps a PDF-writing failure to the host error type. A free function (like
/// [`render_err`]) so the mapping is directly unit-testable: the PDF backend's
/// failures are all "the layout tree is impossible to draw" cases that the
/// validate gate ahead of it already rejects, so this arm has no document that
/// reaches it.
pub(crate) fn pdf_err(err: shojiku_render_pdf::RenderError) -> WasmError {
    WasmError::Render(err.to_string())
}

/// A render that stopped at a document error: no pages, no prepared doc, and
/// the diagnostics explaining why.
fn document_error(format: PageFormat, diagnostics: Diagnostics) -> RenderOutcome {
    RenderOutcome {
        pages: Pages::empty(format),
        prepared: None,
        diagnostics,
    }
}
