//! The MCP tool surface: the call dispatcher, the content-part builders
//! every tool answers with, and the in-band failure mapping. Descriptors
//! (names + JSON schemas) live in `tools/schema.rs`; the shared
//! source→layout pipeline in `tools/pipeline.rs` (its argument halves in
//! `tools/sources.rs` and `tools/assets.rs`). `tools/formats.rs` is the only
//! tool that loads a locale pack WITHOUT a font store: `pipeline.rs` is
//! the one other `load_locale_pack` caller and it builds a `FontStore` on
//! the next line, while `validate` and the example tools need no pack at
//! all.

pub(crate) mod assets;
pub(crate) mod examples;
pub(crate) mod formats;
pub(crate) mod inspect;
pub(crate) mod pipeline;
pub(crate) mod preview;
pub(crate) mod reference;
pub(crate) mod schema;
pub(crate) mod sources;
pub(crate) mod validate;

use crate::ServerArgs;
use crate::rpc::{INVALID_PARAMS, clip};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use pipeline::ToolFailure;
use serde::Serialize;
use serde_json::{Value, json};

/// A tool call's outcome: a result value (which may carry `isError`), or a
/// protocol-level `(code, message)` error for a malformed request.
pub(crate) type ToolOutcome = Result<Value, (i64, String)>;

/// `tools/list` result: the five authoring tools plus the two that read
/// the bundled examples and the two that read the authoring reference.
pub(crate) fn list() -> Value {
    json!({ "tools": schema::descriptors() })
}

/// `tools/call`: routes `name` to its tool over the parsed `arguments`.
pub(crate) fn call(args: &ServerArgs, params: &Value) -> ToolOutcome {
    let Some(name) = params.get("name").and_then(Value::as_str) else {
        return Err((INVALID_PARAMS, "tools/call needs a string `name`".into()));
    };
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if !arguments.is_object() {
        return Err((INVALID_PARAMS, "`arguments` must be an object".into()));
    }
    match name {
        "validate" => validate::run(&arguments),
        "render_preview" => preview::run(args, &arguments),
        "inspect_layout" => inspect::run(args, &arguments),
        "capabilities" => Ok(capabilities_result()),
        "list_examples" => examples::list(&arguments),
        "get_example" => examples::get(&arguments),
        "format_catalog" => formats::run(args, &arguments),
        "list_reference" => reference::list(&arguments),
        "get_reference" => reference::get(&arguments),
        other => Err((INVALID_PARAMS, format!("unknown tool: {}", clip(other)))),
    }
}

/// The `capabilities` tool: this build's engine info (version, capability
/// keys, builtin locales) — needs no inputs.
fn capabilities_result() -> Value {
    let info = shojiku_authoring::run_capabilities().unwrap_or_default();
    tool_result(vec![text_part(info)], false)
}

/// A text content part.
pub(crate) fn text_part(text: String) -> Value {
    json!({ "type": "text", "text": text })
}

/// A PNG image content part (base64 payload).
pub(crate) fn image_part(png: &[u8]) -> Value {
    json!({ "type": "image", "data": STANDARD.encode(png), "mimeType": "image/png" })
}

/// A `tools/call` result envelope.
pub(crate) fn tool_result(content: Vec<Value>, is_error: bool) -> Value {
    json!({ "content": content, "isError": is_error })
}

/// Pretty JSON for a payload (diagnostics lists, envelopes). Serialization
/// of these plain data types cannot fail; degrade to empty over panicking.
pub(crate) fn json_text<T: Serialize>(value: &T) -> String {
    serde_json::to_string_pretty(value).unwrap_or_default()
}

/// Compact JSON for a payload a model reads as DATA, where pretty
/// indentation is pure token cost (schema fragments, catalog nodes).
pub(crate) fn compact_text<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

/// The tool spelling of `resources/read`, shared by `get_example` and
/// `get_reference`: the read's `contents` become embedded `resource` content
/// parts, one for one, so each keeps its URI and MIME type and nothing is
/// wrapped in a JSON string a second time. A failed read is the message as
/// in-band `isError` content (the tool convention), not a protocol error.
pub(crate) fn read_tool(arguments: &Value) -> ToolOutcome {
    if arguments.get("uri").and_then(Value::as_str).is_none() {
        return Err((
            INVALID_PARAMS,
            "`uri` is required and must be a string".into(),
        ));
    }
    match crate::resources::read(arguments) {
        Ok(result) => {
            let parts = result["contents"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|item| json!({ "type": "resource", "resource": item }))
                .collect();
            Ok(tool_result(parts, false))
        }
        Err(error) => Ok(tool_result(vec![text_part(error.message)], true)),
    }
}

/// Maps an in-band failure to an `isError` tool result: a plain message,
/// or the full diagnostics list as JSON so the client sees structure.
pub(crate) fn failure_result(failure: ToolFailure) -> Value {
    match failure {
        ToolFailure::Message(message) => tool_result(vec![text_part(message)], true),
        ToolFailure::Diagnostics(diags) => tool_result(vec![text_part(json_text(&diags))], true),
    }
}

#[cfg(test)]
mod tests;
