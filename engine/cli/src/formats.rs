//! `shojiku formats`: the format catalog as JSON — which display variants a
//! document can pick per field type, what each one renders, and previews of
//! patterns that are not authored yet.
//!
//! The Designer reads the same catalog over the wasm surface; this is how a
//! non-GUI author (or an AI writing a template) discovers the vocabulary
//! without reading the locale pack by hand.

#[cfg(test)]
mod tests;

use crate::args::FormatsArgs;
use crate::error::CliError;
use shojiku_authoring::fs::{load_locale_pack, resolve_locale_dir};
use shojiku_authoring::{PatternProbe, check_probe_count, format_catalog, resolve_locale_id};
use shojiku_core::{Template, parse_template};

/// Reads `--templates` when given. A missing file is an error (the caller
/// named it); NO `--templates` at all is the locale-only catalog.
fn read_template(args: &FormatsArgs) -> Result<Option<Template>, CliError> {
    let Some(path) = args.templates.as_ref() else {
        return Ok(None);
    };
    let src = std::fs::read_to_string(path).map_err(|source| CliError::Io {
        path: path.clone(),
        source,
    })?;
    Ok(Some(parse_template(&src)?))
}

/// Parses one `--probe` value: `<type>:<pattern>`.
///
/// Split at the FIRST colon only, because a pattern routinely contains one
/// (`date:HH:mm` is a `date` probe of `HH:mm`). Which types carry a pattern
/// form is the authoring surface's rule, not this host's.
fn parse_probe(spec: &str) -> Result<PatternProbe, CliError> {
    let (kind, pattern) = spec
        .split_once(':')
        .ok_or_else(|| CliError::BadProbe(spec.to_string()))?;
    PatternProbe::new(kind, pattern).map_err(|_| CliError::BadProbe(spec.to_string()))
}

/// `shojiku formats`: the catalog as pretty JSON on stdout.
pub fn run_formats(args: &FormatsArgs) -> Result<String, CliError> {
    let template = read_template(args)?;
    let locale = resolve_locale_id(
        args.lang.as_deref(),
        template.as_ref().and_then(|t| t.defaults.locale.as_deref()),
    );
    let pack = load_locale_pack(&locale, &resolve_locale_dir(&args.locale_dir))?;
    check_probe_count(args.probe.len()).map_err(|e| CliError::TooManyProbes(e.to_string()))?;
    let probes = args
        .probe
        .iter()
        .map(|spec| parse_probe(spec))
        .collect::<Result<Vec<_>, _>>()?;
    let catalog = format_catalog(template.as_ref(), &pack, &probes);
    Ok(serde_json::to_string_pretty(&catalog)?)
}
