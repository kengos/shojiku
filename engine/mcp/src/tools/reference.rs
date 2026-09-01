//! The two reference-reading tools.
//!
//! `list_reference` is the discovery entry point, for the same reason
//! `list_examples` is one: models call tools reliably, whereas several MCP
//! clients never pull a resource into model context on their own — so the
//! page index is a tool, and its response carries the
//! `shojiku://reference/…` URIs, which is also what teaches the model those
//! URIs exist.
//!
//! `get_reference` exists so a client with no `resources` support is not
//! left able to list and unable to fetch. It delegates to the SAME resolver
//! as `resources/read` — one body of text behind two entry points, never a
//! second copy that can drift.

use super::{json_text, text_part, tool_result};
use crate::reference::{self, uri};
use crate::resources;
use crate::rpc::INVALID_PARAMS;
use serde_json::{json, Value};

/// `list_reference`: every page, with what it covers and what it documents.
pub(crate) fn list(_arguments: &Value) -> super::ToolOutcome {
    let pages: Vec<Value> = reference::catalog()
        .iter()
        .map(|page| {
            json!({
                "uri": uri::page_uri(page.stem),
                "title": page.title,
                "group": page.group,
                "summary": page.summary,
                "shapes": page.shapes,
            })
        })
        .collect();
    let payload = json!({
        "pages": pages,
        "howToRead": format!(
            "Fetch one with get_reference (uri), or resources/read on the same URI. \
             A page returns its markdown (syntax, defaults, limitations) and its \
             catalog shapes as a JSON Schema fragment. Append #<key> to a URI for \
             that key on every shape of the page that carries it, each naming its \
             owner — or #<Shape> / #<Shape>.<key> to narrow. {}",
            reference::nodes::REF_RESOLUTION
        ),
    });
    Ok(tool_result(vec![text_part(json_text(&payload))], false))
}

/// `get_reference`: the tool spelling of `resources/read` for a reference
/// URI.
///
/// The error split follows the tool convention rather than the resource
/// one: a call with no `uri` is a malformed request and answers with a
/// protocol error, but a URI that names no page or no node is something the
/// model should READ and act on — so it comes back in-band as `isError`
/// content.
///
/// `resources::read` dispatches on the URI's own prefix, so this tool also
/// answers an `shojiku://example/…` URI (and `get_example` answers a
/// reference one). That is kept rather than fenced off: the URI says
/// unambiguously which family it names, and a model that reached for the
/// neighbouring tool name gets its answer instead of a round trip. Both
/// descriptors say so, and `tests` pins it in both directions.
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
