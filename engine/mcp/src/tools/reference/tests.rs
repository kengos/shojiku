//! The two reference tools: what `list_reference` advertises, and the
//! tool/resource error split `get_reference` follows.

use super::*;
use crate::test_support::{call_tool, content, text_json};
use serde_json::json;

/// One `list_reference` payload.
fn listed() -> Value {
    let result = call_tool("list_reference", json!({})).expect("list_reference");
    assert_eq!(result["isError"], false);
    text_json(&content(&result)[0])
}

/// One `get_reference` call.
fn fetched(uri: &str) -> Value {
    call_tool("get_reference", json!({ "uri": uri })).expect("get_reference")
}

#[test]
fn list_reference_advertises_every_page_with_its_address() {
    let payload = listed();
    let pages = payload["pages"].as_array().expect("pages");
    assert_eq!(pages.len(), 33);
    for page in pages {
        assert!(page["uri"]
            .as_str()
            .expect("uri")
            .starts_with("shojiku://reference/"));
        assert!(!page["title"].as_str().expect("title").is_empty());
        assert!(!page["summary"].as_str().expect("summary").is_empty());
        assert!(!page["group"].as_str().expect("group").is_empty());
        assert!(page["shapes"].is_array(), "shapes ride the listing");
    }
    // A list an agent cannot act on is a list it will not use: the payload
    // says how to fetch a page and how to address one key.
    let how = payload["howToRead"].as_str().expect("howToRead");
    assert!(how.contains("get_reference"));
    assert!(how.contains("resources/read"));
    assert!(how.contains("#<key>"));
    // And where a `$ref` the schema half cannot resolve is answered. The
    // listing is the only place carrying the owner table (`shapes`), so it
    // is where the rule has to be stated.
    assert!(how.contains("#/$defs/<Name>"));
    assert!(how.contains("shojiku://reference/<page>#<Name>"));
}

#[test]
fn every_shape_the_listing_advertises_is_addressable() {
    // The listing hands the client `shapes` beside a howToRead that says
    // `#<Shape>` narrows — so those names are advertised addresses, and the
    // surface must not advertise a spelling its own parser rejects or its
    // own reader misses. The page URIs get this in the resources tests; the
    // shape names are the half only this tool publishes.
    let payload = listed();
    let mut checked = 0;
    for page in payload["pages"].as_array().expect("pages") {
        let uri = page["uri"].as_str().expect("uri");
        for shape in page["shapes"].as_array().expect("shapes") {
            let name = shape.as_str().expect("shape name");
            let target = format!("{uri}#{name}");
            let parsed = crate::reference::uri::parse(&target)
                .unwrap_or_else(|| panic!("{target} does not parse"));
            assert_eq!(parsed.fragment, Some(name));
            assert_eq!(fetched(&target)["isError"], false, "{target}");
            checked += 1;
        }
    }
    // Positive control, and the partition restated from the wire: 84
    // catalog shapes, each advertised exactly once.
    assert_eq!(checked, 84);
}

#[test]
fn the_two_read_tools_answer_each_others_uris() {
    // Both resolve through `resources::read`, which dispatches on the URI's
    // own prefix. Kept rather than fenced off — the URI is unambiguous, and
    // a model that reached for the neighbouring tool gets its answer — so
    // it is pinned here in both directions rather than left to chance.
    let example = "shojiku://example/business/receipt-ja";
    let result = fetched(example);
    assert_eq!(result["isError"], false, "get_reference on an example URI");
    let payload = text_json(&content(&result)[0]);
    assert!(!payload["contents"].as_array().expect("contents").is_empty());

    let crossed =
        call_tool("get_example", json!({ "uri": "shojiku://reference/box" })).expect("get_example");
    assert_eq!(crossed["isError"], false, "get_example on a reference URI");
    let parts = text_json(&content(&crossed)[0]);
    assert_eq!(parts["contents"].as_array().expect("contents").len(), 2);
}

#[test]
fn list_reference_ignores_unexpected_arguments() {
    // It declares no inputs; a client that sends some must not change the
    // answer or be refused for it.
    let baseline = listed();
    let noisy = call_tool("list_reference", json!({ "page": "box", "junk": [1, 2] }))
        .expect("list_reference");
    assert_eq!(text_json(&content(&noisy)[0]), baseline);
}

#[test]
fn get_reference_and_resources_read_answer_identically() {
    // One body of text behind two entry points. If these ever diverge, a
    // client that can only call tools is reading something else.
    for uri in [
        "shojiku://reference/box",
        "shojiku://reference/rect",
        "shojiku://reference/table#style",
        "shojiku://reference/table#Column.style",
    ] {
        let via_tool = text_json(&content(&fetched(uri))[0]);
        let via_resource = crate::resources::read(&json!({ "uri": uri })).expect("readable");
        assert_eq!(via_tool, via_resource, "{uri} diverged");
    }
}

#[test]
fn a_uri_naming_nothing_comes_back_in_band_as_an_error() {
    // The tool/resource split: `resources/read` answers a miss with the
    // protocol's RESOURCE_NOT_FOUND, while the same target through the tool
    // is content the model should read and act on.
    for uri in [
        "shojiku://reference/no-such-page",
        "shojiku://reference/box#noSuchKey",
    ] {
        let protocol = crate::resources::read(&json!({ "uri": uri })).expect_err("not found");
        assert_eq!(protocol.code, crate::rpc::RESOURCE_NOT_FOUND);

        let result = fetched(uri);
        assert_eq!(result["isError"], true, "{uri}");
        let text = content(&result)[0]["text"].as_str().expect("text");
        assert_eq!(text, protocol.message, "the tool carries the same reason");
    }
}

#[test]
fn a_malformed_uri_also_comes_back_in_band() {
    let result = fetched("shojiku://reference/../../etc/passwd");
    assert_eq!(result["isError"], true);
    assert!(content(&result)[0]["text"]
        .as_str()
        .expect("text")
        .contains("not a Shojiku reference URI"));
}

#[test]
fn get_reference_without_a_uri_is_a_protocol_error() {
    // A missing required argument is a malformed REQUEST, not something
    // the model can act on — so it is the one case that leaves the tool
    // surface as a protocol error.
    for arguments in [json!({}), json!({ "uri": 42 }), json!({ "uri": null })] {
        let (code, message) =
            call_tool("get_reference", arguments).expect_err("should be a protocol error");
        assert_eq!(code, INVALID_PARAMS);
        assert!(message.contains("`uri` is required"));
    }
}

#[test]
fn get_reference_reads_a_page_through_the_tool_surface() {
    let result = fetched("shojiku://reference/box");
    assert_eq!(result["isError"], false);
    let payload = text_json(&content(&result)[0]);
    let parts = payload["contents"].as_array().expect("contents");
    assert_eq!(parts.len(), 2);
    assert!(parts[0]["text"]
        .as_str()
        .expect("text")
        .starts_with("# `box`"));
}
