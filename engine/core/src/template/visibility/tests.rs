//! Wire-shape tests for `visible:`: parse on any item, the defaulted
//! accessors, `deny_unknown_fields` (the proof `flatten` was avoided), the
//! inherited scalar-only `equals`, and authored-form round-trip.

use super::*;
use crate::template::Item;

fn item(yaml: &str) -> Item {
    serde_yaml::from_str(yaml).expect("parse item")
}

fn visible(yaml: &str) -> VisibleBinding {
    item(yaml).visible().expect("visible binding").clone()
}

#[test]
fn parses_a_bare_key_and_defaults_both_accessors() {
    let v = visible("type: text\ntext: hi\nvisible: { key: paid }");
    assert_eq!(v.key, "paid");
    assert!(v.equals.is_none());
    assert_eq!(v.scope(), BindingScope::Element);
    assert!(!v.collapse());
}

#[test]
fn parses_every_key_together() {
    let v = visible(
        "type: image\nbox: { x: 0, y: 0, w: 8, h: 8 }\nsrc: a.svg\n\
         visible: { key: status, equals: approved, scope: document, collapse: true }",
    );
    assert_eq!(v.key, "status");
    assert_eq!(v.equals, Some(EqualsValue(serde_json::json!("approved"))));
    assert_eq!(v.scope(), BindingScope::Document);
    assert!(v.collapse());
}

#[test]
fn an_unknown_key_inside_visible_is_a_parse_error() {
    // The reason `#[serde(flatten)]` was not used to share `MarkBinding`'s
    // three fields: flatten silently disables `deny_unknown_fields`, and a
    // misspelling would then parse as an accepted unknown key.
    let err = serde_yaml::from_str::<Item>(
        "type: rect\nbox: { x: 0, y: 0, w: 1, h: 1 }\nvisible: { key: k, zzz: 1 }",
    )
    .expect_err("unknown key must be rejected");
    assert!(err.to_string().contains("zzz"), "{err}");
}

#[test]
fn a_sequence_equals_is_a_parse_error() {
    let err = serde_yaml::from_str::<Item>(
        "type: rect\nbox: { x: 0, y: 0, w: 1, h: 1 }\nvisible: { key: k, equals: [1, 2] }",
    )
    .expect_err("a sequence `equals` must be rejected");
    assert!(err.to_string().contains("equals"), "{err}");
}

#[test]
fn a_missing_key_is_a_parse_error() {
    serde_yaml::from_str::<Item>("type: page_break\nvisible: { collapse: true }")
        .expect_err("`key` is required");
}

#[test]
fn round_trips_without_injecting_defaults() {
    // Serialize the ITEM NODE alone: older structs still inject defaults at
    // the template level, which would trip a whole-template `contains`.
    let node = item("type: page_break\nvisible: { key: long_form }");
    let out = serde_yaml::to_string(&node).expect("serialize");
    assert!(out.contains("key: long_form"), "{out}");
    assert!(
        !out.contains("collapse"),
        "unset collapse must not serialize: {out}"
    );
    assert!(
        !out.contains("scope"),
        "unset scope must not serialize: {out}"
    );
    assert!(
        !out.contains("equals"),
        "unset equals must not serialize: {out}"
    );
}

#[test]
fn every_item_variant_carries_the_key() {
    // One case per `Item` variant: the key is uniform across the whole item
    // vocabulary, so an author never meets a type that quietly lacks it.
    let cases = [
        "type: text\ntext: t",
        "type: rect\nbox: { x: 0, y: 0, w: 1, h: 1 }",
        "type: line\nfrom: { x: 0, y: 0 }\nto: { x: 1, y: 1 }",
        "type: table\ncolumns: []\ndata: { key: rows }",
        "type: page_number",
        "type: image\nsrc: a.svg",
        "type: container\nitems: []",
        "type: repeat\ndata: { key: rows }\ncell: { items: [] }",
        "type: repeat_flow\ndata: { key: rows }\nitem: { items: [] }",
        "type: qr_code\ntext: t",
        "type: list\ndata: { key: rows }",
        "type: page_break",
        "type: char_grid\ntext: t\ngrid: { charsPerLine: 10, lines: 4 }",
        "type: ellipse\nbox: { x: 0, y: 0, w: 1, h: 1 }",
        "type: checkbox\nbox: { x: 0, y: 0, w: 1, h: 1 }",
    ];
    assert_eq!(cases.len(), 15, "every Item variant needs a case");
    // Collected rather than asserted per case: one run then names EVERY
    // variant that is wrong, instead of stopping at the first.
    let mut bad = Vec::new();
    for case in cases {
        let yaml = format!("{case}\nvisible: {{ key: k }}");
        match serde_yaml::from_str::<Item>(&yaml) {
            Ok(parsed) if parsed.visible().map(|v| v.key.as_str()) == Some("k") => {}
            Ok(_) => bad.push(format!("{case} => parsed but carries no `visible`")),
            Err(e) => bad.push(format!("{case} => {e}")),
        }
    }
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}
