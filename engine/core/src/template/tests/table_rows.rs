//! The `row:` wire: the conditional-style entries (predicate shape,
//! round-trip fidelity, typo safety) alongside the base/zebra layers.

use super::super::*;
use crate::style::TextAlign;

fn table_yaml(table_body: &str) -> String {
    format!(
        "sections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    items:\n      - type: table\n{table_body}"
    )
}

fn parse_table(table_body: &str) -> TableItem {
    let tpl = parse_template(&table_yaml(table_body)).expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Table(t) = &flow.items[0] else { panic!("expected table") };
    (**t).clone()
}

/// A table whose `row:` carries the given conditional entries.
fn conditional_yaml(entries: &str) -> String {
    format!(
        "        data: {{ key: rows }}\n        row:\n          conditionalStyles:\n{entries}        columns:\n          - data: {{ key: a }}\n"
    )
}

#[test]
fn conditional_entries_parse_with_the_mark_predicate_vocabulary() {
    let t = parse_table(&conditional_yaml(
        "            - when: { key: kind, equals: heading }\n              styleNames: [banner]\n              style: { textAlign: center }\n            - when: { key: flagged }\n              style: { backgroundColor: \"#ffffcc\" }\n",
    ));
    let entries = &t.row.conditional_styles;
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].when.key, "kind");
    assert_eq!(
        entries[0].when.equals.as_ref().map(|e| e.0.clone()),
        Some(serde_json::json!("heading"))
    );
    assert_eq!(entries[0].style_names, vec!["banner".to_string()]);
    assert_eq!(entries[0].style.text_align, Some(TextAlign::Center));
    // No `equals` at all is the boolean form.
    assert_eq!(entries[1].when.key, "flagged");
    assert!(entries[1].when.equals.is_none());
}

#[test]
fn every_equals_scalar_form_round_trips_in_its_authored_shape() {
    let t = parse_table(&conditional_yaml(
        "            - when: { key: a, equals: \"2\" }\n            - when: { key: b, equals: 2 }\n            - when: { key: c, equals: 2.5 }\n            - when: { key: d, equals: true }\n",
    ));
    let values: Vec<_> = t
        .row
        .conditional_styles
        .iter()
        .map(|e| e.when.equals.as_ref().expect("equals").0.clone())
        .collect();
    assert_eq!(
        values,
        vec![
            serde_json::json!("2"),
            serde_json::json!(2),
            serde_json::json!(2.5),
            serde_json::json!(true),
        ]
    );
    // The string "2" and the number 2 stay distinguishable after a
    // serialize round-trip (the predicate is type-strict).
    let yaml = serde_yaml::to_string(&t.row.conditional_styles).expect("yaml");
    assert!(yaml.contains("equals: '2'"), "yaml: {yaml}");
    assert!(yaml.contains("equals: 2\n"), "yaml: {yaml}");
}

#[test]
fn an_entry_serializes_only_what_was_authored() {
    let t = parse_table(&conditional_yaml(
        "            - when: { key: kind, equals: heading }\n              style: { textAlign: center }\n",
    ));
    let yaml = serde_yaml::to_string(&t.row.conditional_styles[0]).expect("yaml");
    assert!(!yaml.contains("styleNames"), "unset keys stay out: {yaml}");
    assert!(!yaml.contains("null"), "no injected defaults: {yaml}");
}

#[test]
fn a_row_without_conditional_styles_round_trips_without_the_key() {
    let t = parse_table(
        "        data: { key: rows }\n        columns:\n          - data: { key: a }\n",
    );
    assert!(t.row.is_empty(), "an unauthored row: stays empty");
    let yaml = serde_yaml::to_string(&t.row).expect("yaml");
    assert!(!yaml.contains("conditionalStyles"), "yaml: {yaml}");
}

#[test]
fn a_row_with_conditional_styles_is_not_empty() {
    let t = parse_table(&conditional_yaml(
        "            - when: { key: kind, equals: heading }\n",
    ));
    assert!(!t.row.is_empty(), "entries make the row: worth serializing");
    let yaml = serde_yaml::to_string(&t.row).expect("yaml");
    assert!(yaml.contains("conditionalStyles"), "yaml: {yaml}");
}

#[test]
fn an_unknown_key_in_an_entry_is_a_parse_error() {
    let err = parse_template(&table_yaml(&conditional_yaml(
        "            - when: { key: kind }\n              zzz: 1\n",
    )))
    .expect_err("unknown entry key");
    assert!(format!("{err:?}").contains("zzz"), "err: {err:?}");
}

#[test]
fn an_unknown_key_inside_when_is_a_parse_error() {
    let err = parse_template(&table_yaml(&conditional_yaml(
        "            - when: { key: kind, zzz: 1 }\n",
    )))
    .expect_err("unknown predicate key");
    assert!(format!("{err:?}").contains("zzz"), "err: {err:?}");
}

#[test]
fn a_predicate_without_a_key_is_a_parse_error() {
    let err = parse_template(&table_yaml(&conditional_yaml(
        "            - when: { equals: heading }\n",
    )))
    .expect_err("missing key");
    assert!(format!("{err:?}").contains("key"), "err: {err:?}");
}

#[test]
fn a_non_scalar_equals_is_a_parse_error() {
    let err = parse_template(&table_yaml(&conditional_yaml(
        "            - when: { key: kind, equals: [a, b] }\n",
    )))
    .expect_err("non-scalar equals");
    assert!(format!("{err:?}").contains("equals"), "err: {err:?}");
}
