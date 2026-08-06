//! The two example tools: the catalog listing and the tool spelling of a
//! resource read.

use super::*;
use crate::rpc::RESOURCE_NOT_FOUND;
use serde_json::json;

/// The JSON payload a tool answered with.
fn payload(result: &Value) -> Value {
    let text = result["content"][0]["text"].as_str().expect("text part");
    serde_json::from_str(text).expect("tool payload is JSON")
}

#[test]
fn list_examples_returns_the_whole_catalog() {
    let result = list(&json!({})).expect("succeeds");
    assert_eq!(result["isError"], false);
    let body = payload(&result);
    let entries = body["examples"].as_array().expect("examples");
    assert_eq!(entries.len(), 32);
    for entry in entries {
        assert!(entry["uri"]
            .as_str()
            .expect("uri")
            .starts_with("shojiku://example/"));
        assert!(!entry["title"].as_str().expect("title").is_empty());
        assert!(!entry["exercises"].as_str().expect("exercises").is_empty());
        assert!(!entry["files"].as_array().expect("files").is_empty());
        assert!(entry["bytes"].as_u64().expect("bytes") > 0);
    }
}

#[test]
fn list_examples_says_how_to_fetch_one() {
    let body = payload(&list(&json!({})).expect("succeeds"));
    let how = body["howToRead"].as_str().expect("howToRead");
    assert!(how.contains("get_example"));
    assert!(how.contains("resources/read"));
    assert!(how.contains(&resources::MAX_ENTRY_BYTES.to_string()));
}

#[test]
fn list_examples_ignores_unexpected_arguments() {
    // Unknown params are ignored, not errors.
    let result = list(&json!({ "cursor": "x" })).expect("succeeds");
    assert_eq!(result["isError"], false);
}

#[test]
fn get_example_returns_the_same_body_as_a_resource_read() {
    let uri = "shojiku://example/business/invoice-ja";
    let via_tool = payload(&get(&json!({ "uri": uri })).expect("succeeds"));
    let via_resource = resources::read(&json!({ "uri": uri })).expect("readable");
    assert_eq!(
        via_tool, via_resource,
        "the two entry points must serve one body of text"
    );
}

#[test]
fn get_example_reads_a_single_file() {
    let result = get(&json!({
        "uri": "shojiku://example/presets/blank-a4/templates.yml"
    }))
    .expect("succeeds");
    assert_eq!(result["isError"], false);
    let body = payload(&result);
    assert_eq!(body["contents"].as_array().expect("contents").len(), 1);
}

#[test]
fn a_missing_uri_is_a_protocol_error() {
    let (code, message) = get(&json!({})).expect_err("should have failed");
    assert_eq!(code, INVALID_PARAMS);
    assert!(message.contains("`uri` is required"));

    let (code, _) = get(&json!({ "uri": 7 })).expect_err("should have failed");
    assert_eq!(code, INVALID_PARAMS);
}

#[test]
fn an_unreadable_uri_comes_back_in_band_for_the_model_to_read() {
    // Unlike `resources/read`, a tool reports a bad target as content the
    // model can act on rather than as a protocol fault.
    for uri in [
        "shojiku://example/business/no-such-example",
        "shojiku://example/dev/layout-showcase",
        "file:///etc/passwd",
    ] {
        let result = get(&json!({ "uri": uri })).expect("no protocol error");
        assert_eq!(result["isError"], true, "{uri} should be an in-band error");
        let text = result["content"][0]["text"].as_str().expect("text");
        assert!(!text.is_empty());
    }
}

#[test]
fn the_oversized_entry_explains_itself_in_band() {
    let result = get(&json!({ "uri": "shojiku://example/dev/layout-showcase" })).expect("no fault");
    let text = result["content"][0]["text"].as_str().expect("text");
    assert!(text.contains("shojiku://example/dev/layout-showcase/templates.yml"));
}

#[test]
fn a_hostile_uri_is_refused_in_band_and_clipped() {
    let hostile = format!("shojiku://example/{}", "A".repeat(600));
    let result = get(&json!({ "uri": hostile })).expect("no fault");
    assert_eq!(result["isError"], true);
    let text = result["content"][0]["text"].as_str().expect("text");
    // Bounded at the ECHO, not at the message — see the resources-side twin
    // for why a message-length assertion proves less than it appears to.
    assert_eq!(
        text.matches('A').count(),
        shojiku_diagnostics::MAX_ECHO - uri::PREFIX.len(),
        "the in-band echo must spend exactly the MAX_ECHO budget: {text}"
    );
}

#[test]
fn resource_not_found_stays_distinguishable_from_a_malformed_uri() {
    // The two failure kinds must not collapse into one message.
    let missing = resources::read(&json!({
        "uri": "shojiku://example/business/no-such-example"
    }))
    .expect_err("fails");
    let malformed = resources::read(&json!({ "uri": "file:///etc/passwd" })).expect_err("fails");
    assert_eq!(missing.code, RESOURCE_NOT_FOUND);
    assert_eq!(malformed.code, INVALID_PARAMS);
}
