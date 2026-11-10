//! The URI harness: one input line per flag, and the grammar helpers.

use super::*;
use serde_json::json;

#[test]
fn every_kind_of_uri_sets_its_flag() {
    let input = [
        "shojiku://reference/box",
        "shojiku://reference/box#margin",
        "shojiku://reference/box#noSuchKey",
        "shojiku://reference/../box",
        "shojiku://example/business/receipt-ja",
        "shojiku://example/business/receipt-ja/templates.yml",
        "shojiku://example/dev/layout-showcase",
        "shojiku://example/no/such",
        "https://example.com/",
        &format!("shojiku://reference/{}", "a".repeat(1300)),
    ]
    .join("\n");
    assert_eq!(
        uri(&input),
        UriPaths {
            reference_page: true,
            reference_fragment: true,
            example_entry: true,
            example_file: true,
            over_bundle_cap: true,
            reference_not_found: true,
            example_not_found: true,
            reference_malformed: true,
            example_malformed: true,
            echo_clipped: true,
        }
    );
}

#[test]
fn the_grammar_refuses_relative_and_foreign_segments() {
    assert!(accepted("a.b_c-9"));
    for part in ["", ".", "..", "a/b", "a%2e", "é"] {
        assert!(!accepted(part), "{part:?}");
    }
}

#[test]
#[should_panic(expected = "outside the grammar")]
fn an_id_outside_the_grammar_fails() {
    assert_id("a/..");
}

#[test]
#[should_panic(expected = "names another URI")]
fn a_content_item_naming_another_uri_fails() {
    assert_contents(&json!({ "contents": [{ "uri": "x" }] }), |uri| uri == "y");
}
