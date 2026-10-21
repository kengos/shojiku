//! Running one pattern probe.
//!
//! Split from the module root for the line budget.

use super::exemplar;
use super::{MAX_PROBE_PATTERN, MAX_PROBES, PatternProbe, ProbeRefusal, ProbeResult, ProbeType};
use shojiku_core::{FieldType, FormatDefaults, FormatRef, InlineFormat};
use shojiku_formatter::{FormatContext, LangPack, format_value};

/// Runs one probe: an inline pattern rendered through the real dispatch.
///
/// The pattern rides `FormatDefaults` rather than a second code path, so a
/// probe answers with exactly what the document would render if the same
/// pattern were authored.
pub(super) fn run(
    index: usize,
    p: &PatternProbe,
    pack: &LangPack,
    ctx: &FormatContext,
) -> ProbeResult {
    if index >= MAX_PROBES {
        return refused(ProbeRefusal::TooManyProbes);
    }
    if p.pattern.chars().count() > MAX_PROBE_PATTERN {
        return refused(ProbeRefusal::PatternTooLong);
    }
    let inline = FormatRef::Inline(InlineFormat {
        pattern: p.pattern.clone(),
    });
    let mut defaults = FormatDefaults::default();
    let field_type = match p.field_type {
        ProbeType::Datetime => {
            defaults.datetime = Some(inline);
            FieldType::Datetime
        }
        ProbeType::Date => {
            defaults.date = Some(inline);
            FieldType::Date
        }
    };
    let probe_ctx = FormatContext {
        defaults: Some(&defaults),
        named: ctx.named,
        currency: ctx.currency,
    };
    let spec = exemplar::spec(field_type);
    let value = exemplar::values(field_type);
    let formatted = value
        .first()
        .and_then(|v| format_value(v, Some(&spec), None, probe_ctx, pack).ok());
    ProbeResult {
        sample: formatted
            .as_ref()
            .map(|f| f.text.clone())
            .unwrap_or_default(),
        // A fn item, not a closure: `run` pins the type to date/datetime and
        // picks no variant, so today nothing here can warn — and a closure
        // that never runs is an instantiation the coverage gate reds. The
        // plumbing stays so a future degradation is not swallowed silently.
        warning: formatted
            .and_then(|f| f.warning)
            .as_ref()
            .map(ToString::to_string),
        refused: None,
    }
}

fn refused(why: ProbeRefusal) -> ProbeResult {
    ProbeResult {
        sample: String::new(),
        warning: None,
        refused: Some(why),
    }
}
