//! Golden diagnostics through the `validate` tool: clean, warning, error,
//! and parse-failure fixtures.

use crate::rpc::INVALID_PARAMS;
use crate::test_support::{
    call_tool, content, diag_items, examples_dir, path_arg, read_example, temp_file,
};
use serde_json::json;

#[test]
fn clean_example_yields_empty_diagnostics() {
    let result = call_tool(
        "validate",
        json!({
            "definitionsPath": path_arg(examples_dir().join("definitions.yml")),
            "templatePath": path_arg(examples_dir().join("templates.yml")),
            "paramsPath": path_arg(examples_dir().join("params.json")),
        }),
    )
    .expect("validate");
    assert_eq!(result["isError"], false);
    let parts = content(&result);
    assert_eq!(parts.len(), 1);
    assert_eq!(diag_items(&parts[0]), json!([]));
}

#[test]
fn missing_data_key_is_a_warning_diagnostic() {
    let template = temp_file(
        "ghost-binding.yml",
        "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: text\n        data: { key: order.ghost }\n",
    );
    let params = temp_file("v-empty.json", "{}");
    let result = call_tool(
        "validate",
        json!({ "templatePath": template, "paramsPath": params }),
    )
    .expect("validate");
    assert_eq!(result["isError"], false);
    let diags = diag_items(&content(&result)[0]);
    let diag = &diags[0];
    assert_eq!(diag["code"], "missing_data");
    assert_eq!(diag["severity"], "warning");
    assert_eq!(diag["args"]["key"], "order.ghost");
}

#[test]
fn sourceless_image_is_an_error_diagnostic() {
    let template = temp_file(
        "v-sourceless.yml",
        "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: image\n        box: { x: 0, y: 0, w: 50, h: 50 }\n",
    );
    let result = call_tool("validate", json!({ "templatePath": template })).expect("validate");
    assert_eq!(result["isError"], false);
    let diags = diag_items(&content(&result)[0]);
    let diag = &diags[0];
    assert_eq!(diag["code"], "image_source_missing");
    assert_eq!(diag["severity"], "error");
}

#[test]
fn parse_failures_surface_as_a_parse_error_diagnostic() {
    let template = temp_file("v-bad.yml", "sections: [not: a: map\n");
    let result = call_tool("validate", json!({ "templatePath": template })).expect("validate");
    assert_eq!(result["isError"], false);
    let diags = diag_items(&content(&result)[0]);
    assert_eq!(diags[0]["code"], "parse_error");
}

#[test]
fn unreadable_paths_fail_in_band() {
    let result =
        call_tool("validate", json!({ "templatePath": "/no/such/t.yml" })).expect("validate");
    assert_eq!(result["isError"], true);
    let text = content(&result)[0]["text"].as_str().expect("text");
    assert!(text.contains("/no/such/t.yml"), "{text}");

    // Optional paths are read too when present.
    let result = call_tool(
        "validate",
        json!({
            "definitionsPath": "/no/such/defs.yml",
            "templatePath": path_arg(examples_dir().join("templates.yml")),
        }),
    )
    .expect("validate");
    assert_eq!(result["isError"], true);
    let result = call_tool(
        "validate",
        json!({
            "templatePath": path_arg(examples_dir().join("templates.yml")),
            "paramsPath": "/no/such/params.json",
        }),
    )
    .expect("validate");
    assert_eq!(result["isError"], true);
}

#[test]
fn missing_template_path_is_invalid_params() {
    let Err((code, message)) = call_tool("validate", json!({})) else {
        panic!("expected invalid params");
    };
    assert_eq!(code, INVALID_PARAMS);
    assert!(
        message.contains("`template` or `templatePath` is required"),
        "{message}"
    );
}

#[test]
fn inline_sources_validate_like_their_paths_do() {
    // The FS-less client's form: the same three sources as text.
    let result = call_tool(
        "validate",
        json!({
            "definitions": read_example("definitions.yml"),
            "template": read_example("templates.yml"),
            "params": read_example("params.json"),
        }),
    )
    .expect("validate");
    assert_eq!(result["isError"], false);
    assert_eq!(diag_items(&content(&result)[0]), json!([]));

    // An inline template is validated on its own merits, not read as a path.
    let result = call_tool(
        "validate",
        json!({ "template": "sections: [not: a: map\n" }),
    )
    .expect("validate");
    assert_eq!(diag_items(&content(&result)[0])[0]["code"], "parse_error");
}

#[test]
fn a_source_given_twice_is_invalid_params() {
    let Err((code, message)) = call_tool(
        "validate",
        json!({
            "template": "page: {}",
            "templatePath": path_arg(examples_dir().join("templates.yml")),
        }),
    ) else {
        panic!("expected invalid params");
    };
    assert_eq!(code, INVALID_PARAMS);
    assert!(message.contains("mutually exclusive"), "{message}");
}
