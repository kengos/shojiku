//! The `inspect_layout` tool: the inspect envelope (engine info, layout
//! tree, path-addressed boxes for every item, page margins) followed by
//! the diagnostics JSON — the machine-readable half of the
//! preview/tree/diagnostics bundle.

use super::pipeline::{prepare_from, CallArgs, ToolFailure};
use super::{failure_result, json_text, text_part, tool_result, ToolOutcome};
use crate::ServerArgs;
use serde_json::Value;
use shojiku_authoring::inspect_json;

/// Runs `inspect_layout` over the path arguments.
pub(crate) fn run(server: &ServerArgs, arguments: &Value) -> ToolOutcome {
    let call = CallArgs::parse(arguments)?;
    Ok(match run_inner(server, &call) {
        Ok(result) => result,
        Err(failure) => failure_result(failure),
    })
}

/// The pipeline: prepare → serialize the envelope + diagnostics.
fn run_inner(server: &ServerArgs, call: &CallArgs) -> Result<Value, ToolFailure> {
    let doc = prepare_from(server, call)?;
    let envelope = inspect_json(&doc.prepared).unwrap_or_default();
    Ok(tool_result(
        vec![
            text_part(envelope),
            text_part(json_text(&doc.prepared.diagnostics)),
        ],
        false,
    ))
}

#[cfg(test)]
mod tests;
