//! The format catalog: which display variants a document can pick per
//! field type, what each one actually renders, and a preview of a pattern
//! that is not in the document yet.
//!
//! This exists so an editor never formats. The Designer used to carry a
//! hand-written table of illustrative sample strings; every value here is
//! produced by [`shojiku_formatter`] against the SAME dispatch a real
//! binding takes, so a sample cannot drift from what the page will show.
//!
//! It is deliberately NOT part of the inspect envelope. `inspect` describes
//! a laid-out document and rides the preview loop, while a catalog is a
//! function of (locale pack, template registry) — and, for a probe, of a
//! pattern the document does not contain yet, which `inspect` cannot
//! describe by construction.

mod exemplar;
mod probe;
#[cfg(test)]
mod tests;
mod variants;

use serde::Serialize;
use shojiku_core::{FieldType, Template};
use shojiku_formatter::{FormatContext, LangPack};

/// The most pattern probes one call may ask for. A picker previews the
/// pattern being edited, so one is the realistic case; the cap is what
/// stops a caller-supplied list from being a work amplifier.
pub const MAX_PROBES: usize = 16;

/// The longest probe pattern accepted, in characters. Template-authored
/// patterns are bounded by the template size cap; a probe arrives straight
/// from a host with no such bound, so it gets its own.
pub const MAX_PROBE_PATTERN: usize = 256;

/// Where a variant's spelling comes from. The distinction is load-bearing
/// for an editor: a `Registry` name is the document's own and breaks when
/// it is renamed, while the other two are supplied under it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FormatOrigin {
    /// The engine's own vocabulary (the currency variants, `default`).
    Builtin,
    /// A variant the locale pack declares.
    Pack,
    /// An entry in the template's `formats:` registry.
    Registry,
}

/// One pickable variant, with what it renders for this document.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatVariant {
    /// The wire spelling, verbatim. Registry and pack names are
    /// document-derived, but they are NOT sanitized on the way out: a
    /// spelling here is re-authored back as `format: <spelling>`, so a
    /// clipped or control-stripped one would name nothing. A name that
    /// would not survive the echo guard is dropped instead (`pickable`).
    pub spelling: String,
    pub origin: FormatOrigin,
    /// The rendered sample(s). One entry for every type but `quantity`,
    /// which is plural-aware and therefore samples both arms.
    pub samples: Vec<String>,
}

/// One field type's pickable vocabulary.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatTypeEntry {
    /// The type's wire spelling (`date`, `currency`, …).
    pub field_type: String,
    /// Whether the type has a real choice. `number`, `percentage` and
    /// `quantity` have no named variants in v1 — any pick but `default`
    /// warns — so an editor shows what they render and offers no control.
    pub fixed: bool,
    pub variants: Vec<FormatVariant>,
}

/// A pattern the caller wants previewed before authoring it.
#[derive(Debug, Clone)]
pub struct PatternProbe {
    /// `date` or `datetime`; any other type has no pattern form.
    pub field_type: FieldType,
    pub pattern: String,
}

/// What one probe rendered, or why it was refused.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    /// The rendered sample. Empty when `refused` is set.
    pub sample: String,
    /// A degradation the formatter reported. No probe can currently produce
    /// one — a probe is always run as a date/datetime with no variant picked,
    /// which is the one shape that never warns — but the field carries any
    /// future one rather than dropping it. The engine never translates: this
    /// is the English default, and a consumer with a catalog renders its own.
    pub warning: Option<String>,
    /// Set when the probe was not run at all: it exceeded a cap.
    pub refused: Option<ProbeRefusal>,
}

/// Why a probe was not run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeRefusal {
    /// Past [`MAX_PROBE_PATTERN`].
    PatternTooLong,
    /// Past [`MAX_PROBES`]; every probe after the cap carries this.
    TooManyProbes,
}

/// The catalog for one (template, locale) pair.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatCatalog {
    pub types: Vec<FormatTypeEntry>,
    pub probes: Vec<ProbeResult>,
}

/// The types that carry a format layer, in the order an editor shows them.
const TYPES: [FieldType; 6] = [
    FieldType::Date,
    FieldType::Datetime,
    FieldType::Currency,
    FieldType::Number,
    FieldType::Percentage,
    FieldType::Quantity,
];

/// The currency vocabulary, which is the engine's own rather than the
/// pack's — `money.rs` matches these three by name and warns on anything
/// else, registry names and inline patterns included.
pub(crate) const CURRENCY_VARIANTS: [&str; 3] = ["default", "symbol", "name"];

/// Builds the catalog: every pickable variant per type with what it
/// renders, plus one result per requested probe.
///
/// Pure over its inputs, so the same template and pack always produce the
/// same catalog — hosts marshal, they never compute.
///
/// `template` is OPTIONAL because a live editor's document is invalid for
/// much of the time somebody is typing in it, and a picker that empties
/// out then is worse than one still showing the locale's own vocabulary.
/// Without a document the catalog carries the pack and the engine's
/// builtins, and no registry entries.
pub fn format_catalog(
    template: Option<&Template>,
    pack: &LangPack,
    probes: &[PatternProbe],
) -> FormatCatalog {
    let ctx = FormatContext {
        defaults: template.and_then(|t| t.defaults.formats.as_ref()),
        named: template.map(|t| &t.formats),
        currency: template.and_then(|t| t.defaults.currency.as_deref()),
    };
    FormatCatalog {
        types: TYPES
            .iter()
            .map(|t| variants::type_entry(*t, template, pack, &ctx))
            .collect(),
        probes: probes
            .iter()
            .enumerate()
            .map(|(n, p)| probe::run(n, p, pack, &ctx))
            .collect(),
    }
}
