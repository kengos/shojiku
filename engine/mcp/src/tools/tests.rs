//! The tool registry: descriptor conformance, call routing guards, and
//! the diagnostics-bundle invariant every template tool must honor.

use super::*;
use crate::test_support::{
    call_tool, content, diag_items, examples_dir, path_arg, read_example, text_json,
};
use serde_json::json;

#[test]
fn tools_list_pins_the_descriptor_contract() {
    let list = list();
    let tools = list["tools"].as_array().expect("tools");
    let names: Vec<&str> = tools
        .iter()
        .map(|t| t["name"].as_str().expect("name"))
        .collect();
    assert_eq!(
        names,
        [
            "validate",
            "render_preview",
            "inspect_layout",
            "capabilities"
        ]
    );
    for tool in tools {
        assert!(tool["description"].as_str().expect("description").len() > 20);
        assert_eq!(tool["inputSchema"]["type"], "object");
    }
    // Each source is required in ONE of its two spellings; a flat `required`
    // cannot say that, so the either-or rides `allOf`/`anyOf`.
    assert_eq!(
        tools[0]["inputSchema"]["allOf"],
        json!([{ "anyOf": [{ "required": ["template"] }, { "required": ["templatePath"] }] }])
    );
    let template_and_params = json!([
        { "anyOf": [{ "required": ["template"] }, { "required": ["templatePath"] }] },
        { "anyOf": [{ "required": ["params"] }, { "required": ["paramsPath"] }] },
    ]);
    assert_eq!(tools[1]["inputSchema"]["allOf"], template_and_params);
    assert_eq!(tools[2]["inputSchema"]["allOf"], template_and_params);
    for tool in &tools[..3] {
        assert!(
            tool["inputSchema"]["required"].is_null(),
            "a flat `required` would forbid the inline form"
        );
    }
    // Argument shapes are client contract: pin each tool's property set.
    assert_eq!(
        property_names(&tools[0]),
        [
            "definitions",
            "definitionsPath",
            "params",
            "paramsPath",
            "template",
            "templatePath"
        ]
    );
    assert_eq!(
        property_names(&tools[1]),
        [
            "allowDynamicImage",
            "assetMode",
            "assetsDir",
            "definitions",
            "definitionsPath",
            "denyDynamicImage",
            "lang",
            "page",
            "params",
            "paramsPath",
            "scale",
            "template",
            "templatePath"
        ]
    );
    assert_eq!(
        property_names(&tools[2]),
        [
            "allowDynamicImage",
            "assetMode",
            "assetsDir",
            "definitions",
            "definitionsPath",
            "denyDynamicImage",
            "lang",
            "params",
            "paramsPath",
            "template",
            "templatePath"
        ]
    );
    assert!(property_names(&tools[3]).is_empty());
    // The asset knobs are pinned by value, not just by name: an AI client
    // reads the mode vocabulary and the list cap out of the schema.
    for tool in &tools[1..3] {
        let props = &tool["inputSchema"]["properties"];
        assert_eq!(props["assetMode"]["enum"], json!(["open", "bundled-only"]));
        assert_eq!(
            props["allowDynamicImage"]["maxItems"],
            json!(super::assets::MAX_ASSET_IDS)
        );
        assert_eq!(props["denyDynamicImage"]["items"]["type"], "string");
    }
}

/// A tool descriptor's schema property names, sorted.
fn property_names(tool: &Value) -> Vec<String> {
    let props = tool["inputSchema"]["properties"]
        .as_object()
        .expect("properties");
    props.keys().cloned().collect()
}

#[test]
fn unknown_tools_and_malformed_calls_are_invalid_params() {
    let hostile = format!("t{}\u{7}", "x".repeat(400));
    let (code, message) = call_tool(&hostile, json!({})).unwrap_err();
    assert_eq!(code, INVALID_PARAMS);
    assert!(
        message.len() < 250 && !message.contains('\u{7}'),
        "{message}"
    );

    let args = crate::test_support::server_args();
    let (code, _) = call(&args, &json!({ "arguments": {} })).unwrap_err();
    assert_eq!(code, INVALID_PARAMS);
    let (code, _) = call(&args, &json!({ "name": "validate", "arguments": [1] })).unwrap_err();
    assert_eq!(code, INVALID_PARAMS);
}

#[test]
fn capabilities_needs_no_arguments_and_matches_the_authoring_payload() {
    let args = crate::test_support::server_args();
    let result = call(&args, &json!({ "name": "capabilities" })).expect("capabilities");
    assert_eq!(result["isError"], false);
    let parts = content(&result);
    assert_eq!(parts.len(), 1);
    let info = text_json(&parts[0]);
    assert_eq!(info["version"], env!("CARGO_PKG_VERSION"));
    let caps = info["capabilities"].as_array().expect("capability keys");
    for key in ["mcp.stdio", "mcp.inline_sources", "mcp.asset_policy"] {
        assert!(caps.iter().any(|c| c == key), "missing capability {key}");
    }
}

#[test]
fn every_template_tool_response_carries_the_diagnostics_bundle() {
    // The docs/agents/mcp.md principle: no template tool may answer with
    // an image alone — diagnostics ride every response (and the layout
    // tree is retrievable via inspect_layout with the same inputs).
    let arguments = json!({
        "definitionsPath": path_arg(examples_dir().join("definitions.yml")),
        "templatePath": path_arg(examples_dir().join("templates.yml")),
        "paramsPath": path_arg(examples_dir().join("params.json")),
    });
    assert_bundle_over(&arguments);
}

#[test]
fn the_inline_form_answers_the_same_bundle() {
    // The widening must not fork the response shape: the same three tools,
    // the same parts, with no filesystem path in the call at all.
    assert_bundle_over(&json!({
        "definitions": read_example("definitions.yml"),
        "template": read_example("templates.yml"),
        "params": read_example("params.json"),
        "assetsDir": path_arg(examples_dir()),
    }));
}

/// Every template tool answers diagnostics last (and preview an image).
fn assert_bundle_over(arguments: &Value) {
    for tool in ["validate", "render_preview", "inspect_layout"] {
        let result = call_tool(tool, arguments.clone()).expect(tool);
        assert_eq!(result["isError"], false, "{tool}: {result}");
        let parts = content(&result);
        let last = parts.last().expect("at least one part");
        let diags = diag_items(last);
        assert!(diags.is_array(), "{tool}: last part must be diagnostics");
        if tool == "render_preview" {
            assert!(
                parts.iter().any(|p| p["type"] == "image"),
                "preview must carry an image part"
            );
        }
    }
}
