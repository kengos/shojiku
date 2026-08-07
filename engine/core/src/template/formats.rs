//! Template presentation defaults: the `defaults:` block (root
//! style + per-type format defaults) and the top-level `formats:` named
//! registry — the CSS-`:root` analog that lets a document say "dates
//! look like THIS everywhere" while placements stay `data: { key }`.
//!
//! Precedence, low→high: pack default ← `defaults.formats[type]` ←
//! definitions `Field.format` ← placement `format:`. Patterns may appear
//! ONLY here and in locale packs (placements/definitions are name
//! references) — the guard against the Thinreports per-item format-key
//! explosion.

use crate::style::Style;
use serde::{Deserialize, Serialize};

/// The `defaults:` block: document-wide presentation defaults.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateDefaults {
    /// Document locale id (BCP 47, e.g. `ja-JP`): the fallback the CLI
    /// Uses to pick the locale pack when `--lang` is absent. The
    /// authoring home for the document locale — replaces the old
    /// top-level `definitions.locale` key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    /// Document currency code (ISO 4217, e.g. `JPY`): the middle of the
    /// currency fallback chain (`Field.currency` → this → the pack's
    /// `currencyDefault`), threaded to the formatter via `FormatContext`
    ///. Replaces the old top-level `definitions.currency` key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    /// The cascade ROOT style. Inherited properties flow into every item
    /// that doesn't override them, and the `rem` root follows this
    /// style's computed `fontSize` (falling back to the engine default).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Style>,
    /// Per-type format defaults, applied when neither the placement nor
    /// the field picks a format.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formats: Option<FormatDefaults>,
}

impl TemplateDefaults {
    /// Whether nothing is set (skip serialization so round-tripped
    /// templates stay as authored).
    pub fn is_empty(&self) -> bool {
        self.locale.is_none()
            && self.currency.is_none()
            && self.style.is_none()
            && self.formats.is_none()
    }
}

/// Format default per field type. A typed struct (not a map) so an
/// unknown type key is a parse error, never silently ignored.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FormatDefaults {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<FormatRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub datetime: Option<FormatRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub number: Option<FormatRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub currency: Option<FormatRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub percentage: Option<FormatRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quantity: Option<FormatRef>,
}

/// A format default's value: a variant-name string (a pack variant, a
/// `formats:` registry name, or a currency variant) or an inline
/// definition map. The string|map union follows the `Length`/`PageSize`
/// wire precedent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(untagged)]
pub enum FormatRef {
    /// A variant name reference (locale-independent).
    Name(String),
    /// An inline definition (date/datetime only — other types warn at
    /// validate and fall back at render).
    Inline(InlineFormat),
}

/// The inline definition body. Only `pattern` exists today; new keys
/// stay append-only (`Option`+skip).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InlineFormat {
    /// A CLDR-subset date/datetime pattern (the pack `dateFormats`
    /// grammar).
    pub pattern: String,
}

/// One `formats:` registry entry: a named, reusable format definition
/// (parallel to the `styles:` registry). v1 carries pattern kinds only
/// (`date`/`datetime`); `quantity` entries are deferred until composition
/// proves insufficient (user decision).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NamedFormat {
    #[serde(rename = "type")]
    pub kind: NamedFormatKind,
    /// A CLDR-subset pattern (the same grammar as pack `dateFormats`).
    pub pattern: String,
}

/// The registry entry kinds v1 supports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum NamedFormatKind {
    Date,
    Datetime,
}

/// Maximum entries in a template's `formats:` registry — mirrors
/// [`crate::style::MAX_STYLES`] (untrusted templates; name resolution is
/// a bounded fold). Extra entries are ignored with a warning.
pub const MAX_FORMATS: usize = 256;
