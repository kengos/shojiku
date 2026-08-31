//! The format-catalog op over an injected [`Session`]: which display
//! variants the document can pick per field type, what each renders, and a
//! preview of a pattern that is not authored yet.
//!
//! Pure core, like its siblings — source string in, a Rust-typed catalog
//! out. All of the work is `shojiku_authoring::format_catalog`; this is the
//! session plumbing (the locale pack) plus the one editor-shaped decision
//! below.

use crate::error::WasmError;
use crate::session::Session;
use serde::Deserialize;
use shojiku_authoring::{
    format_catalog, load_pack, locale_facts, FormatCatalog, LocaleFacts, PatternProbe, MAX_PROBES,
};
use shojiku_core::{parse_template, FieldType};

/// One probe as a host sends it: `{ "fieldType": "date", "pattern": "…" }`.
///
/// `deny_unknown_fields` on purpose — a mistyped key is refused rather than
/// silently dropped, the same rule the template wire follows.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProbeInput {
    field_type: String,
    pattern: String,
}

/// Parses a host's probe list.
///
/// This lives in the pure core rather than the shim so the host gates
/// exercise it: the `cfg(wasm32)` shim is never compiled by clippy, test or
/// coverage, and a parser is not marshalling.
///
/// The COUNT cap is applied here as a refusal, ahead of the per-probe
/// refusals the catalog itself reports. A host that asks for a million
/// probes has made an API mistake; one that asks for a few too many gets
/// them back individually marked.
pub fn parse_probes(json: &str) -> Result<Vec<PatternProbe>, WasmError> {
    let raw: Vec<ProbeInput> =
        serde_json::from_str(json).map_err(|e| WasmError::BadProbes(e.to_string()))?;
    if raw.len() > MAX_PROBES * 2 {
        return Err(WasmError::BadProbes(format!(
            "{} probes requested; at most {} are answered",
            raw.len(),
            MAX_PROBES
        )));
    }
    raw.into_iter()
        .map(|p| match FieldType::from_name(&p.field_type) {
            Some(field_type @ (FieldType::Date | FieldType::Datetime)) => Ok(PatternProbe {
                field_type,
                pattern: p.pattern,
            }),
            // Every other type has no pattern form at all, so accepting one
            // would answer a question the wire cannot be asked.
            _ => Err(WasmError::BadProbes(format!(
                "`{}` has no pattern form; probe `date` or `datetime`",
                shojiku_diagnostics::sanitize(&p.field_type, 40)
            ))),
        })
        .collect()
}

impl Session {
    /// The format catalog for `template_src` under the injected locale.
    ///
    /// A template that does NOT parse yields the pack-and-builtins catalog
    /// rather than an error: this drives a live picker, and the document is
    /// invalid for much of the time somebody is typing in it — a picker
    /// that empties out mid-keystroke is worse than one that keeps showing
    /// the locale's own vocabulary and drops the document's registry names
    /// until the file is whole again.
    ///
    /// Needs a locale, which is the one genuine host-misuse case here.
    pub fn format_catalog(
        &self,
        template_src: &str,
        probes: &[PatternProbe],
    ) -> Result<FormatCatalog, WasmError> {
        let pack = self.pack.as_ref().ok_or(WasmError::LocaleNotSet)?;
        let template = parse_template(template_src).ok();
        Ok(format_catalog(template.as_ref(), pack, probes))
    }

    /// The locale facts for `locale_id` — what picking it does to a date, a
    /// number and an amount — under `template_src`'s own `defaults.currency`.
    ///
    /// The pack is loaded from `overlay` HERE and thrown away; the session's
    /// own pack is neither read nor replaced. That is the point: a Designer's
    /// locale panel explains the tag the DOCUMENT declares, and the preview
    /// deliberately renders through the tag the host set at boot, so the two
    /// are routinely different. Making this borrow the session's pack would
    /// answer the wrong question, and making it `set_locale` would move the
    /// preview under the reader.
    ///
    /// `overlay` is what `set_locale` takes: `None` resolves a builtin, and a
    /// non-builtin id needs the pack text the host holds. An id that resolves
    /// to neither is refused rather than guessed — a `defaults.locale` is
    /// author-typed, so the miss is ordinary, not exceptional.
    pub fn locale_facts(
        &self,
        template_src: &str,
        locale_id: &str,
        overlay: Option<&str>,
    ) -> Result<LocaleFacts, WasmError> {
        let pack = load_pack(locale_id, overlay).map_err(|e| WasmError::Locale(e.to_string()))?;
        let template = parse_template(template_src).ok();
        Ok(locale_facts(template.as_ref(), &pack))
    }
}
