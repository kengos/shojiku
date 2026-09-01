//! `resources/read` over the reference family: the two-part page read, the
//! three selector forms, and the list↔parse round trip.
//!
//! The hostile-input boundary is its own module (`hostile`), so the shape
//! of the surface and the shape of its refusals stay separately readable.

mod hostile;

use super::*;
use crate::rpc::RESOURCE_NOT_FOUND;
use serde_json::json;
use std::path::PathBuf;

/// A `resources/read` through the PUBLIC entry point, so the dispatch on
/// the URI prefix is exercised too — not just this module's `read`.
fn get(uri: &str) -> Result<Value, RpcError> {
    crate::resources::read(&json!({ "uri": uri }))
}

/// The error a read is expected to fail with.
fn err(uri: &str) -> RpcError {
    get(uri).expect_err("should have failed")
}

/// The `contents` array of a successful read.
fn parts(uri: &str) -> Vec<Value> {
    get(uri).expect("readable")["contents"]
        .as_array()
        .expect("contents")
        .clone()
}

/// One fragment read's parsed envelope.
fn envelope(uri: &str) -> Value {
    let parts = parts(uri);
    assert_eq!(parts.len(), 1, "a fragment answers one part");
    assert_eq!(parts[0]["mimeType"], "application/json");
    assert_eq!(parts[0]["uri"], uri);
    serde_json::from_str(parts[0]["text"].as_str().expect("text")).expect("envelope JSON")
}

#[test]
fn a_page_read_returns_its_markdown_and_its_schema() {
    let parts = parts("shojiku://reference/box");
    assert_eq!(parts.len(), 2);
    assert_eq!(parts[0]["mimeType"], "text/markdown");
    assert_eq!(parts[1]["mimeType"], "application/schema+json");
    // Both halves are contents OF the page, and the schema half has no
    // separate address, so both carry the page's own URI.
    for part in &parts {
        assert_eq!(part["uri"], "shojiku://reference/box");
    }
}

#[test]
fn the_markdown_part_is_the_repo_file_byte_for_byte() {
    let parts = parts("shojiku://reference/box");
    let served = parts[0]["text"].as_str().expect("text");
    let disk = std::fs::read_to_string(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/engine/box.md"),
    )
    .expect("page is readable");
    assert!(
        disk.ends_with(served),
        "the served body must be a suffix of the file"
    );
    assert!(served.starts_with("# `box`"), "front matter is stripped");
    assert!(
        !served.contains("shapes: [OptBox"),
        "the front matter must not survive into the body"
    );
    // The prose half is the point of serving markdown at all: the catalog
    // cannot express a syntax example or a Limitations section.
    assert!(served.contains("```yaml"));
    assert!(served.contains("## Limitations"));
}

#[test]
fn the_schema_part_carries_exactly_the_declared_shapes() {
    let parts = parts("shojiku://reference/box");
    let schema: Value =
        serde_json::from_str(parts[1]["text"].as_str().expect("text")).expect("schema JSON");
    let defs = schema["$defs"].as_object().expect("$defs");
    let page = reference::find("box").expect("box");
    assert_eq!(defs.len(), page.shapes.len());
    for shape in &page.shapes {
        let node = defs.get(shape).expect("declared shape resolves");
        assert!(
            node["description"].as_str().is_some_and(|d| !d.is_empty()),
            "{shape} lost its authored description"
        );
    }
}

#[test]
fn a_page_with_no_declared_shapes_still_answers_two_parts() {
    // Eleven pages are in this state. The contents array's shape must not
    // depend on which page was asked for.
    let parts = parts("shojiku://reference/rect");
    assert_eq!(parts.len(), 2);
    assert_eq!(parts[1]["mimeType"], "application/schema+json");
    let schema: Value =
        serde_json::from_str(parts[1]["text"].as_str().expect("text")).expect("schema JSON");
    assert_eq!(schema["$defs"], json!({}), "an empty `$defs` is the answer");
}

#[test]
fn the_schema_half_says_where_its_refs_resolve() {
    // The nodes cross-reference each other as `#/$defs/<Name>`, and the
    // page→shape map is a PARTITION — so a referenced shape is always owned
    // by another page and no page can resolve its own pointers. A client
    // meeting a dangling `$ref` in a document typed `application/schema+json`
    // has to be able to learn the rule from the document itself.
    let parts = parts("shojiku://reference/box");
    let schema: Value =
        serde_json::from_str(parts[1]["text"].as_str().expect("text")).expect("schema JSON");
    // The hazard is real on this very page, not hypothetical: `OptBox.w`
    // points at `Length`, which the `length` page owns.
    assert_eq!(
        schema["$defs"]["OptBox"]["properties"]["w"]["anyOf"][0]["$ref"],
        "#/$defs/Length"
    );
    assert!(
        schema["$defs"]["Length"].is_null(),
        "the pointer dangles here"
    );
    let comment = schema["$comment"].as_str().expect("$comment");
    assert!(comment.contains("shojiku://reference/<page>#<Name>"));
    assert!(comment.contains("list_reference"));
    // And the address the comment sends the client to is a real one.
    let owner = reference::find("length").expect("the length page");
    assert!(owner.shapes.iter().any(|shape| shape == "Length"));
}

#[test]
fn a_bare_key_returns_only_the_nodes_that_carry_it() {
    let body = envelope("shojiku://reference/box#margin");
    assert_eq!(body["page"], "box");
    assert_eq!(body["fragment"], "margin");
    let matches = body["matches"].as_array().expect("matches");
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0]["shape"], "OptBox");
    assert_eq!(matches[0]["key"], "margin");
    assert!(matches[0]["schema"]["description"].is_string());
    // Only the named key: the rest of OptBox does not ride along.
    assert!(matches[0]["schema"]["properties"].is_null());
}

#[test]
fn an_ambiguous_key_returns_every_match_each_naming_its_shape() {
    // `style` is a property of five of `table`'s seven shapes. A lookup
    // would have to pick one and be wrong four times; the enumeration is
    // never wrong, and it costs no disambiguation round trip.
    let body = envelope("shojiku://reference/table#style");
    let matches = body["matches"].as_array().expect("matches");
    let shapes: Vec<&str> = matches
        .iter()
        .map(|m| m["shape"].as_str().expect("shape"))
        .collect();
    assert_eq!(
        shapes,
        [
            "Column",
            "RowSpec",
            "RowConditionalStyle",
            "HeaderGroup",
            "TableHeaderSpec"
        ],
        "every owner, in the page's declared order"
    );
    for m in matches {
        assert_eq!(m["key"], "style");
    }

    // The other half of the pair: on the 28 unambiguous pages the same
    // grammar degrades to exactly one node. A lone multi-match case does
    // not prove the single-match path.
    let single = envelope("shojiku://reference/box#margin");
    assert_eq!(single["matches"].as_array().expect("matches").len(), 1);
}

#[test]
fn a_shape_and_a_qualified_key_both_resolve() {
    let shape = envelope("shojiku://reference/table#Column");
    let matches = shape["matches"].as_array().expect("matches");
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0]["shape"], "Column");
    assert!(matches[0]["key"].is_null(), "a whole shape has no key");
    assert!(matches[0]["schema"]["properties"]["style"].is_object());

    let qualified = envelope("shojiku://reference/table#Column.style");
    let matches = qualified["matches"].as_array().expect("matches");
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0]["shape"], "Column");
    assert_eq!(matches[0]["key"], "style");
}

#[test]
fn a_well_formed_uri_naming_no_page_is_not_found() {
    let error = err("shojiku://reference/no-such-page");
    assert_eq!(error.code, RESOURCE_NOT_FOUND);
    assert!(error.message.contains("no reference page"));
    // The positive control for the echo: a benign URI DOES come back, so
    // "stopped echoing entirely" cannot be mistaken for "correctly bounded".
    assert!(error.message.contains("no-such-page"));
    assert_eq!(
        error.data.expect("data member")["uri"],
        "shojiku://reference/no-such-page"
    );
}

#[test]
fn a_selector_naming_no_node_is_not_found() {
    let error = err("shojiku://reference/box#noSuchKey");
    assert_eq!(error.code, RESOURCE_NOT_FOUND);
    assert!(error.message.contains("no reference node"));
    assert_eq!(
        error.data.expect("data member")["uri"],
        "shojiku://reference/box#noSuchKey"
    );
    // A shape that exists in the catalog but belongs to another page is a
    // miss here too — the address space is page-scoped.
    assert_eq!(
        err("shojiku://reference/box#Column").code,
        RESOURCE_NOT_FOUND
    );
}

#[test]
fn every_uri_the_list_advertises_round_trips_and_reads() {
    let entries = list_entries();
    assert_eq!(entries.len(), 33);
    for entry in &entries {
        let uri = entry["uri"].as_str().expect("uri");
        let parsed = uri::parse(uri).unwrap_or_else(|| panic!("{uri} does not parse"));
        assert_eq!(parsed.stem, entry["name"].as_str().expect("name"));
        assert_eq!(parsed.fragment, None);
        // Advertised means fetchable: the surface cannot list a spelling
        // its own parser rejects, nor one its own reader misses.
        assert_eq!(parts(uri).len(), 2);
        assert!(!entry["title"].as_str().expect("title").is_empty());
        assert!(!entry["description"].as_str().expect("summary").is_empty());
        assert!(entry["size"].as_u64().expect("size") > 0);
        assert_eq!(entry["mimeType"], "text/markdown");
    }
    // Deterministic order, matching `embed::PAGES`, so a list that
    // reshuffles between calls cannot invalidate a client's prompt cache.
    let uris: Vec<&str> = entries
        .iter()
        .map(|e| e["uri"].as_str().expect("uri"))
        .collect();
    let mut sorted = uris.clone();
    sorted.sort_unstable();
    assert_eq!(uris, sorted, "reference resources stay ordered by stem");
}
