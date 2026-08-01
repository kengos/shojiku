//! The inspect envelope + diagnostics bundle, and its failure modes.

use crate::test_support::{
    call_tool, content, diag_items, examples_dir, path_arg, temp_file, text_json,
};
use serde_json::json;

#[test]
fn envelope_carries_engine_document_boxes_and_margin() {
    let result = call_tool(
        "inspect_layout",
        json!({
            "definitionsPath": path_arg(examples_dir().join("definitions.yml")),
            "templatePath": path_arg(examples_dir().join("templates.yml")),
            "paramsPath": path_arg(examples_dir().join("params.json")),
        }),
    )
    .expect("inspect");
    assert_eq!(result["isError"], false);
    let parts = content(&result);
    assert_eq!(parts.len(), 2, "envelope + diagnostics");
    let envelope = text_json(&parts[0]);
    assert_eq!(envelope["engine"]["version"], env!("CARGO_PKG_VERSION"));
    let caps = envelope["engine"]["capabilities"].as_array().expect("caps");
    assert!(caps.iter().any(|c| c == "mcp.stdio"));
    assert!(!envelope["document"]["pages"]
        .as_array()
        .expect("pages")
        .is_empty());
    assert!(envelope["boxes"].is_object() || envelope["boxes"].is_array());
    assert_eq!(envelope["margin"].as_array().expect("margin").len(), 4);
    assert_eq!(diag_items(&parts[1]), json!([]));
}

#[test]
fn broken_templates_answer_diagnostics_in_band() {
    let template = temp_file(
        "i-sourceless.yml",
        "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: image\n        box: { x: 0, y: 0, w: 50, h: 50 }\n",
    );
    let params = temp_file("i-empty.json", "{}");
    let result = call_tool(
        "inspect_layout",
        json!({ "templatePath": template, "paramsPath": params }),
    )
    .expect("inspect");
    assert_eq!(result["isError"], true);
    let diags = diag_items(&content(&result)[0]);
    assert_eq!(diags[0]["code"], "image_source_missing");
}

#[test]
fn missing_params_path_is_invalid_params() {
    let arguments = json!({ "templatePath": path_arg(examples_dir().join("templates.yml")) });
    assert!(call_tool("inspect_layout", arguments).is_err());
}
