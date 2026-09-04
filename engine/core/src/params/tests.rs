//! Unit tests for the `params` runtime-data model.

use super::*;
use serde_json::json;

#[test]
fn parses_json_params() {
    let params = parse_params(r#"{"order": {"code": "ORDER1"}}"#).expect("parse");
    assert_eq!(params["order"]["code"], json!("ORDER1"));
}

#[test]
fn parses_yaml_params() {
    let params = parse_params("order:\n  code: ORDER1\n").expect("parse");
    assert_eq!(params["order"]["code"], json!("ORDER1"));
}

#[test]
fn rejects_non_finite_numbers() {
    let err = parse_params("amount:\n  total: .inf\n").expect_err("must reject");
    assert!(err.to_string().contains("non-finite"), "got: {err}");
}

#[test]
fn resolves_nested_path() {
    let params = json!({"a": {"b": {"c": 42}}});
    assert_eq!(resolve_path(&params, "a.b.c"), Some(&json!(42)));
}

#[test]
fn missing_path_is_none() {
    let params = json!({"a": {"b": 1}});
    assert_eq!(resolve_path(&params, "a.x"), None);
    assert_eq!(resolve_path(&params, "a.b.c"), None);
}

#[test]
fn resolves_array_value_as_whole() {
    let params = json!({"items": [1, 2, 3]});
    assert_eq!(resolve_path(&params, "items"), Some(&json!([1, 2, 3])));
}

#[test]
fn absent_null_and_empty_string_are_blank() {
    assert!(is_blank(None));
    assert!(is_blank(Some(&json!(null))));
    assert!(is_blank(Some(&json!(""))));
}

#[test]
fn whitespace_zero_and_false_are_not_blank() {
    // Authored whitespace is content a form may want drawn; `0`/`false`
    // are real values a placeholder must never mask.
    assert!(!is_blank(Some(&json!(" "))));
    assert!(!is_blank(Some(&json!("　"))));
    assert!(!is_blank(Some(&json!(0))));
    assert!(!is_blank(Some(&json!(false))));
}

#[test]
fn empty_containers_are_not_blank() {
    // Arrays/objects belong to the table/repeat machinery, which reports
    // its own `not_an_array`/empty-behavior — not to the placeholder.
    assert!(!is_blank(Some(&json!([]))));
    assert!(!is_blank(Some(&json!({}))));
}
