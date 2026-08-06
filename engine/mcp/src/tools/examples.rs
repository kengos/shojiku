//! The two example-reading tools.
//!
//! `list_examples` is the discovery entry point: models call tools
//! reliably, whereas several MCP clients never pull a resource into model
//! context on their own — so the catalog is a tool, and its response
//! carries the `shojiku://example/…` URIs, which is also what teaches the
//! model those URIs exist.
//!
//! `get_example` exists so a client with no `resources` support is not left
//! able to list and unable to fetch. It delegates to the SAME resolver as
//! `resources/read` — one body of text behind two entry points, never a
//! second copy that can drift.

use super::{json_text, text_part, tool_result};
use crate::examples::{self, uri};
use crate::resources;
use crate::rpc::INVALID_PARAMS;
use serde_json::{json, Value};

/// `list_examples`: the whole bundled catalog, one line of prose each.
pub(crate) fn list(_arguments: &Value) -> super::ToolOutcome {
    let entries: Vec<Value> = examples::catalog()
        .iter()
        .map(|entry| {
            json!({
                "uri": uri::entry_uri(entry.id),
                "title": entry.title,
                "exercises": entry.description,
                "files": entry.files.iter().map(|f| f.name).collect::<Vec<_>>(),
                "bytes": entry.size(),
            })
        })
        .collect();
    let payload = json!({
        "examples": entries,
        "howToRead": format!(
            "Fetch one with get_example (uri), or resources/read on the same URI. \
             An entry returns its source files together. Append /<file> to a URI \
             to read a single file — needed for entries over the {}-byte bundle cap.",
            resources::MAX_ENTRY_BYTES
        ),
    });
    Ok(tool_result(vec![text_part(json_text(&payload))], false))
}

/// `get_example`: the tool spelling of `resources/read`.
///
/// The error split follows the tool convention rather than the resource
/// one: a call with no `uri` is a malformed request and answers with a
/// protocol error, but a URI that names nothing, is shaped wrong, or is too
/// big to bundle is something the model should READ and act on — so it
/// comes back in-band as `isError` content.
pub(crate) fn get(arguments: &Value) -> super::ToolOutcome {
    if arguments.get("uri").and_then(Value::as_str).is_none() {
        return Err((
            INVALID_PARAMS,
            "`uri` is required and must be a string".into(),
        ));
    }
    match resources::read(arguments) {
        Ok(result) => Ok(tool_result(vec![text_part(json_text(&result))], false)),
        Err(error) => Ok(tool_result(vec![text_part(error.message)], true)),
    }
}

#[cfg(test)]
mod tests;
