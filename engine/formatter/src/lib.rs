//! Locale-aware value formatting.
//!
//! The formatter is generic: locale defaults (date patterns, separators,
//! currency display, era tables, units, fonts) come from **builtin
//! CLDR-generated packs** compiled into the binary
//! ([`BUILTIN_LOCALE_IDS`]), with `packs/locale/<id>.yml` as an optional
//! per-key overlay (and the only source for non-builtin locales);
//! business-specific formats belong in plugins.

mod format;
mod lang;

pub use format::{format_value, FormatContext, FormatError, FormatWarning, Formatted};
pub use lang::{
    currency_fraction_digits, resolve_face_bytes, resolve_face_bytes_subset, resolve_face_specs,
    CurrencySpec, EraDate, EraSpec, FaceBytes, FaceSpec, FontFaceDecl, InjectedPack, LangPack,
    LangPackError, LocaleFonts, NumberSpec, PackError, PackManifest, SubsetFaces, UnitSpec,
    BUILTIN_LOCALE_IDS,
};
