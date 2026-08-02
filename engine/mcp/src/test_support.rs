//! Shared fixtures for the crate's unit tests: the bundled receipt
//! example, the repo pack dirs, temp source files, and a one-shot
//! tool-call helper.

use crate::ServerArgs;
use serde_json::{json, Value};
use std::path::PathBuf;

pub(crate) fn examples_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/business/receipt-ja")
}

/// One of the bundled receipt example's source files, as text (the inline
/// argument form takes the same content the path form reads).
pub(crate) fn read_example(name: &str) -> String {
    std::fs::read_to_string(examples_dir().join(name)).expect("read example source")
}

pub(crate) fn font_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts")
}

pub(crate) fn locale_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/locale")
}

pub(crate) fn server_args() -> ServerArgs {
    ServerArgs {
        font_dir: vec![font_dir()],
        locale_dir: vec![locale_dir()],
    }
}

/// Calls one tool through the dispatcher with the repo pack dirs.
pub(crate) fn call_tool(name: &str, arguments: Value) -> crate::tools::ToolOutcome {
    let params = json!({ "name": name, "arguments": arguments });
    crate::tools::call(&server_args(), &params)
}

/// A UTF-8 path string argument.
pub(crate) fn path_arg(path: PathBuf) -> String {
    path.to_str().expect("utf8 path").to_string()
}

/// Writes `content` to a per-process temp file and returns its path string.
pub(crate) fn temp_file(name: &str, content: &str) -> String {
    let path = std::env::temp_dir().join(format!("shojiku-mcp-{}-{name}", std::process::id()));
    std::fs::write(&path, content).expect("write temp file");
    path_arg(path)
}

/// The content array of a tool result.
pub(crate) fn content(result: &Value) -> &Vec<Value> {
    result["content"].as_array().expect("content array")
}

/// Parses a text content part as JSON.
pub(crate) fn text_json(part: &Value) -> Value {
    assert_eq!(part["type"], "text", "expected a text part: {part}");
    serde_json::from_str(part["text"].as_str().expect("text")).expect("text part JSON")
}

/// Parses a diagnostics text part and returns its `items` array (the same
/// `{"items": [...]}` shape the CLI's validate JSON prints).
pub(crate) fn diag_items(part: &Value) -> Value {
    let diags = text_json(part);
    assert!(diags["items"].is_array(), "expected diagnostics: {diags}");
    diags["items"].clone()
}
