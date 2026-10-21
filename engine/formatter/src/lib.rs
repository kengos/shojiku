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

pub use format::{
    FormatContext, FormatError, FormatWarning, Formatted, PATTERN_TOKENS, format_value,
};
pub use lang::{
    BUILTIN_LOCALE_IDS, CurrencySpec, EraDate, EraSpec, FaceBytes, FaceSpec, FontFaceDecl,
    InjectedPack, LangPack, LangPackError, LocaleFonts, MAX_PACK_ID, NumberSpec, PackError,
    PackManifest, SubsetFaces, UnitSpec, currency_fraction_digits, read_pack_file,
    resolve_face_bytes, resolve_face_bytes_subset, resolve_face_specs, resolve_face_specs_with,
    valid_pack_id,
};
