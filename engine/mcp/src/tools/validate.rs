//! The `validate` tool: parse + validate the sources and answer the full
//! diagnostics list (parse failures surface as diagnostics, not errors —
//! the client renders them like any other finding).

use super::pipeline::ToolFailure;
use super::sources::{opt_source, req_source, Source};
use super::{failure_result, json_text, text_part, tool_result, ToolOutcome};
use serde_json::Value;
use shojiku_authoring::validate_strings;

/// Runs `validate` over the source arguments (paths or inline text).
pub(crate) fn run(arguments: &Value) -> ToolOutcome {
    let definitions = opt_source(arguments, "definitions")?;
    let template = req_source(arguments, "template")?;
    let params = opt_source(arguments, "params")?;
    Ok(
        match run_inner(definitions.as_ref(), &template, params.as_ref()) {
            Ok(result) => result,
            Err(failure) => failure_result(failure),
        },
    )
}

/// Resolves the sources and validates; only unreadable files fail in-band.
fn run_inner(
    definitions: Option<&Source>,
    template: &Source,
    params: Option<&Source>,
) -> Result<Value, ToolFailure> {
    let defs = definitions.map(Source::read).transpose()?;
    let template = template.read()?;
    let params = params.map(Source::read).transpose()?;
    let diags = validate_strings(defs.as_deref(), &template, params.as_deref());
    Ok(tool_result(vec![text_part(json_text(&diags))], false))
}

#[cfg(test)]
mod tests;
