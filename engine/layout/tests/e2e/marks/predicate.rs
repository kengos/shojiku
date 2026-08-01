//! The params predicate through the atom: array multi-select and the
//! type-mismatch / not-boolean warnings.

use super::flow;
use crate::common::*;

fn has(diags: &Diagnostics, code: &str) -> bool {
    diags.iter().any(|d| d.code == code)
}

#[test]
fn array_contains_is_multi_select() {
    let items = "      - type: checkbox\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        data: { key: causes, equals: \"1\" }\n      - type: checkbox\n        box: { x: 0, y: 20, w: 10, h: 10 }\n        data: { key: causes, equals: \"2\" }\n      - type: checkbox\n        box: { x: 0, y: 40, w: 10, h: 10 }\n        data: { key: causes, equals: \"3\" }\n";
    let (doc, diags) = run(&flow(items), json!({ "causes": ["1", "3"] }));
    // Three frames, two checks (1 and 3).
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 3);
    assert_eq!(path_shapes(&doc.pages[0]).len(), 2);
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn array_missing_element_is_silent() {
    let items = "      - type: checkbox\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        data: { key: causes, equals: \"9\" }\n";
    let (doc, diags) = run(&flow(items), json!({ "causes": ["1", "3"] }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
    assert!(diags.is_empty(), "silent non-match: {diags:?}");
}

#[test]
fn array_all_wrong_type_warns() {
    // equals is a number; every element is a string — no kind overlap.
    let items = "      - type: checkbox\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        data: { key: causes, equals: 2 }\n";
    let (doc, diags) = run(&flow(items), json!({ "causes": ["1", "3"] }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
    assert!(has(&diags, "mark_equals_type_mismatch"), "{diags:?}");
}

#[test]
fn scalar_type_mismatch_warns_and_skips() {
    // params carries the string "2"; equals is the number 2.
    let items = "      - type: checkbox\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        data: { key: status, equals: 2 }\n";
    let (doc, diags) = run(&flow(items), json!({ "status": "2" }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
    assert!(has(&diags, "mark_equals_type_mismatch"), "{diags:?}");
}

#[test]
fn boolean_binding_on_non_bool_warns() {
    let items = "      - type: ellipse\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        data: { key: flag }\n";
    let (doc, diags) = run(&flow(items), json!({ "flag": "yes" }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
    assert!(has(&diags, "mark_value_not_bool"), "{diags:?}");
}

#[test]
fn empty_multi_select_is_silent() {
    // A blank form with nothing selected (`[]`) must not warn on each box.
    let items = "      - type: checkbox\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        data: { key: causes, equals: \"1\" }\n";
    let (doc, diags) = run(&flow(items), json!({ "causes": [] }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
    assert!(diags.is_empty(), "empty multi-select is silent: {diags:?}");
}

#[test]
fn missing_value_is_silent() {
    // A blank form omits the key entirely — nothing draws, nothing warns.
    let items = "      - type: ellipse\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        data: { key: payment, equals: \"カード\" }\n";
    let (doc, diags) = run(&flow(items), json!({}));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
    assert!(diags.is_empty(), "{diags:?}");
}
