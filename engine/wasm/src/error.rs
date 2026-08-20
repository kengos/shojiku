//! The wasm-surface host-misuse error type plus its stable `code`/`args`
//! registry. Document problems ride the render bundle's diagnostics; these
//! errors are the ONLY thing the surface throws. Mirroring the diagnostics
//! discipline, each variant has a stable snake_case `code` + typed `args`
//! so a JS host branches on the code (e.g. clamp a stale `page_out_of_range`
//! and re-render) instead of string-matching the localizable message. The
//! codes and their per-code arg keys are an append-only contract.

use shojiku_diagnostics::ArgValue;
use thiserror::Error;

/// Host API misuse — the ONLY thing the surface returns as an error (document
/// problems ride the render bundle's diagnostics instead). Each variant maps
/// to a thrown JS error in the shim, carrying [`WasmError::code`] +
/// [`WasmError::args`].
#[derive(Debug, Error)]
pub enum WasmError {
    /// A render/inspect was requested before `set_locale`.
    #[error("no locale set; call set_locale first")]
    LocaleNotSet,
    /// A render was requested before `load_fonts`.
    #[error("fonts not loaded; call load_fonts first")]
    FontsNotLoaded,
    /// `set_locale` failed (unknown locale, malformed overlay).
    #[error("locale error: {0}")]
    Locale(String),
    /// A font file was added for a pack id that was never declared.
    #[error("unknown font pack `{0}`; call add_font_pack first")]
    UnknownFontPack(String),
    /// `load_fonts` failed (sha256 mismatch, no embedding rights, no faces).
    #[error("font error: {0}")]
    Fonts(String),
    /// `scale` is not a positive finite number.
    #[error("scale {0} is not a positive finite number")]
    BadScale(f64),
    /// Rasterization failed after a successful layout.
    #[error("render error: {0}")]
    Render(String),
    /// A selected page index is past the document's last page.
    #[error("page {page} is out of range (document has {total} pages)")]
    PageOutOfRange {
        /// The requested 0-based page index.
        page: usize,
        /// The number of pages the document has.
        total: usize,
    },
    /// The probe list handed to `format_catalog` is not the expected JSON
    /// (`[{ fieldType, pattern }]`), or names a field type that has no
    /// pattern form. Refused rather than defaulted — the typo-safety rule
    /// the whole wire follows.
    #[error("bad format probes: {0}")]
    BadProbes(String),
    /// An all-pages raw render would exceed the page cap; the uncompressed
    /// pages would accumulate in the host heap. Select a page instead.
    #[error("document has {total} pages (over the {cap}-page raw cap); pass a page index")]
    TooManyRawPages {
        /// The number of pages the document has.
        total: usize,
        /// The raw all-pages cap.
        cap: usize,
    },
}

impl WasmError {
    /// The stable snake_case code identifying this host-API misuse. A JS
    /// host branches on it (append-only contract) instead of matching the
    /// localizable message string.
    pub fn code(&self) -> &'static str {
        match self {
            WasmError::LocaleNotSet => "locale_not_set",
            WasmError::FontsNotLoaded => "fonts_not_loaded",
            WasmError::Locale(_) => "locale_error",
            WasmError::UnknownFontPack(_) => "unknown_font_pack",
            WasmError::Fonts(_) => "font_error",
            WasmError::BadScale(_) => "bad_scale",
            WasmError::Render(_) => "render_error",
            WasmError::PageOutOfRange { .. } => "page_out_of_range",
            WasmError::TooManyRawPages { .. } => "too_many_raw_pages",
            WasmError::BadProbes(_) => "bad_probes",
        }
    }

    /// The typed args for this error, keyed by a stable name (append-only
    /// per code). Detail strings route through [`ArgValue::text`]
    /// (control-strip + 200-char clip), so a hostile locale/font/render
    /// message cannot inject control chars or overflow the arg.
    pub fn args(&self) -> Vec<(&'static str, ArgValue)> {
        match self {
            WasmError::LocaleNotSet | WasmError::FontsNotLoaded => Vec::new(),
            WasmError::Locale(detail)
            | WasmError::Fonts(detail)
            | WasmError::Render(detail)
            | WasmError::BadProbes(detail) => {
                vec![("detail", ArgValue::text(detail))]
            }
            WasmError::UnknownFontPack(pack) => vec![("pack", ArgValue::text(pack))],
            WasmError::BadScale(scale) => vec![("scale", ArgValue::from(*scale))],
            WasmError::PageOutOfRange { page, total } => {
                vec![
                    ("page", ArgValue::from(*page)),
                    ("total", ArgValue::from(*total)),
                ]
            }
            WasmError::TooManyRawPages { total, cap } => {
                vec![
                    ("total", ArgValue::from(*total)),
                    ("cap", ArgValue::from(*cap)),
                ]
            }
        }
    }
}
