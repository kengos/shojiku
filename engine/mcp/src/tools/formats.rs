//! The `format_catalog` tool: which display variants a document may pick per
//! field type, what each one renders, and previews of patterns the document
//! does not carry yet.
//!
//! The THIRD host over `shojiku_authoring::format_catalog` — `shojiku formats`
//! and the wasm binding the Designer reads are the other two. All three
//! marshal the same pure catalog and compute nothing, so an AI client
//! discovering the vocabulary here sees exactly what the page will show.
//!
//! Unlike its sibling tools this one does NOT ride `pipeline::prepare_from`:
//! a catalog is a function of (locale pack, template registry), so there are
//! no params to read, no fonts to load and no layout to run.
//!
//! What that also skips is the VALIDATION gate, which is the only place
//! `MAX_FORMATS` is ever applied — and it only diagnoses, never truncates
//! (`engine/core/src/validate/formats.rs`). So the registry walked here is
//! whatever the inline cap admits, and `variants::spellings` dedupes with a
//! linear scan. The same is true of the CLI and the wasm host, which reach
//! the catalog the same way; it is a property of `format_catalog` rather
//! than of this host.

use super::pipeline::{opt_string, tool_msg, ToolFailure};
use super::sources::{opt_source, Source};
use super::{failure_result, json_text, text_part, tool_result, ToolOutcome};
use crate::rpc::{clip, INVALID_PARAMS};
use crate::ServerArgs;
use serde_json::Value;
use shojiku_authoring::fs::{load_locale_pack, resolve_locale_dir};
use shojiku_authoring::{format_catalog, resolve_locale_id, PatternProbe, MAX_PROBES};
use shojiku_core::{parse_template, FieldType, Template};
use shojiku_diagnostics::Diagnostics;

/// Runs `format_catalog`. Every argument is optional: with no template at all
/// the answer is the locale's own vocabulary, which is what an author who has
/// not written a document yet needs.
pub(crate) fn run(server: &ServerArgs, arguments: &Value) -> ToolOutcome {
    let template = opt_source(arguments, "template")?;
    let lang = opt_string(arguments, "lang")?;
    let probes = parse_probes(arguments)?;
    Ok(
        match run_inner(server, template.as_ref(), lang.as_deref(), &probes) {
            Ok(result) => result,
            Err(failure) => failure_result(failure),
        },
    )
}

/// Resolves the template and locale, then answers the catalog followed by the
/// diagnostics (the bundle principle: no payload without its reasons).
fn run_inner(
    server: &ServerArgs,
    template: Option<&Source>,
    lang: Option<&str>,
    probes: &[PatternProbe],
) -> Result<Value, ToolFailure> {
    let src = template.map(Source::read).transpose()?;
    let (template, diagnostics) = parse(src.as_deref());
    let locale = resolve_locale_id(
        lang,
        template.as_ref().and_then(|t| t.defaults.locale.as_deref()),
    );
    let pack =
        load_locale_pack(&locale, &resolve_locale_dir(&server.locale_dir)).map_err(tool_msg)?;
    let catalog = format_catalog(template.as_ref(), &pack, probes);
    Ok(tool_result(
        vec![
            text_part(json_text(&catalog)),
            text_part(json_text(&diagnostics)),
        ],
        false,
    ))
}

/// Parses the template when one was passed.
///
/// A source that does not parse yields the pack-and-builtins catalog PLUS the
/// parse diagnostic, rather than a refusal. An empty `formats:` half with
/// nothing beside it reads as "the registry does not work"; the diagnostic
/// says which line broke. The other two hosts answer differently on purpose —
/// the CLI hard-errors because a command has one outcome, and the wasm host
/// stays silent because a live picker must not empty out mid-keystroke.
///
/// These diagnostics are PARSE-ONLY. An empty list here says the file is
/// well-formed, never that the document is valid; `validate` is that tool.
fn parse(src: Option<&str>) -> (Option<Template>, Diagnostics) {
    let mut diagnostics = Diagnostics::new();
    let template = src.and_then(|src| match parse_template(src) {
        Ok(template) => Some(template),
        Err(err) => {
            diagnostics.push(err.to_diagnostic());
            None
        }
    });
    (template, diagnostics)
}

/// Parses the `probes` argument: `[{ "fieldType": "date", "pattern": "…" }]`.
///
/// Structured objects rather than the CLI's `<type>:<pattern>` string — a
/// JSON client composes JSON, and a positional mini-language would be a
/// second grammar for the client to keep in step with the parser.
///
/// The COUNT is capped HERE, as invalid params: the descriptor declares
/// `maxItems`, so an over-long list is a wrong-shaped argument. A pattern past
/// the LENGTH cap is deliberately left to the engine, which refuses that probe
/// alone as `refused: "patternTooLong"` — naming WHICH probe was too long,
/// where one flat protocol error could not.
fn parse_probes(arguments: &Value) -> Result<Vec<PatternProbe>, (i64, String)> {
    let items = match arguments.get("probes") {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(Value::Array(items)) => items,
        Some(_) => return Err(not_a_probe_list()),
    };
    if items.len() > MAX_PROBES {
        return Err((
            INVALID_PARAMS,
            format!(
                "`probes` has {} entries, over the {MAX_PROBES}-entry cap",
                items.len()
            ),
        ));
    }
    items.iter().map(parse_probe).collect()
}

/// Parses one probe entry. Only `date` and `datetime` carry a pattern form,
/// so accepting any other type would answer a question the wire cannot be
/// asked — the same rule the CLI and the wasm host apply.
fn parse_probe(item: &Value) -> Result<PatternProbe, (i64, String)> {
    let (Some(field_type), Some(pattern)) = (
        item.get("fieldType").and_then(Value::as_str),
        item.get("pattern").and_then(Value::as_str),
    ) else {
        return Err(not_a_probe_list());
    };
    match FieldType::from_name(field_type) {
        Some(field_type @ (FieldType::Date | FieldType::Datetime)) => Ok(PatternProbe {
            field_type,
            pattern: pattern.to_string(),
        }),
        _ => Err((
            INVALID_PARAMS,
            format!(
                "`{}` has no pattern form; probe `date` or `datetime`",
                clip(field_type)
            ),
        )),
    }
}

/// The shared wrong-shape refusal. Never echoes the offending value: a
/// malformed entry is a client bug, and the shape is what says so.
fn not_a_probe_list() -> (i64, String) {
    (
        INVALID_PARAMS,
        "`probes` must be an array of { fieldType, pattern } objects".into(),
    )
}

#[cfg(test)]
mod tests;
