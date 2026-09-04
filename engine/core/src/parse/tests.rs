//! Unit tests for the two-pass typed parse.

use super::*;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
struct Doc {
    items: Vec<Item>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
struct Item {
    #[allow(dead_code)]
    name: String,
}

#[test]
fn parses_valid_input() {
    let doc: Doc = parse_checked("items:\n  - name: a\n", "doc").expect("parse");
    assert_eq!(doc.items.len(), 1);
}

#[test]
fn unknown_key_error_carries_path_and_location() {
    let err = parse_checked::<Doc>("items:\n  - name: a\n    bogus: x\n", "doc")
        .expect_err("must reject");
    // Plain structs (no tagged enum) keep the full path — the unknown
    // key is appended — and an accurate location.
    let CoreError::Located { path, line, .. } = &err else { panic!("{err:?}") };
    assert_eq!(path, "items[0].bogus");
    assert_eq!(*line, 3);
}

#[test]
fn non_finite_is_rejected_before_typed_parse() {
    // Guard order: the finiteness check runs on pass 1, so `.inf`
    // is a `NonFinite`, never a located type error.
    let err = parse_checked::<Doc>("items:\n  - name: .inf\n", "doc").expect_err("reject");
    assert!(matches!(err, CoreError::NonFinite("doc")), "got: {err:?}");
}

#[test]
fn malformed_yaml_surfaces_as_parse_error() {
    let err = parse_checked::<Doc>("items: [unterminated\n", "doc").expect_err("reject");
    assert!(matches!(err, CoreError::Parse(_)), "got: {err:?}");
}
