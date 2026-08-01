//! Schema-check edge cases: the mismatch message's JSON type words,
//! a non-object params root, and the format/base-type coherence warning.

use super::*;

#[test]
fn a_non_object_params_root_is_silent() {
    let template = tpl("      - type: text\n        text: static\n");
    let diags = validate(Some(&sdefs()), &template, Some(&json!([1, 2])));
    assert!(find(&diags, "params_unknown_key").is_empty(), "{diags:?}");
    assert!(
        find(&diags, "params_missing_required").is_empty(),
        "{diags:?}"
    );
}

#[test]
fn mismatch_actual_covers_the_json_type_words() {
    // Each mismatch names the ACTUAL value's JSON type word.
    let diags = run(json!({
        "receipt": 42,
        "rate": "fast",
        "paid": [1],
        "count": {}
    }));
    let messages: Vec<&str> = find(&diags, "params_type_mismatch")
        .iter()
        .map(|d| d.message.as_str())
        .collect();
    assert_eq!(messages.len(), 4, "{diags:?}");
    assert!(messages
        .iter()
        .any(|m| m.contains("expects object, got number")));
    assert!(messages
        .iter()
        .any(|m| m.contains("expects number, got string")));
    assert!(messages
        .iter()
        .any(|m| m.contains("expects boolean, got array")));
    assert!(messages
        .iter()
        .any(|m| m.contains("expects integer, got object")));
}

#[test]
fn known_format_on_the_wrong_base_warns_once() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  order:
    type: object
    properties:
      code:
        type: string
        format: currency
  rows:
    type: array
    items:
      type: object
      properties:
        at:
          type: number
          format: date-time
"#,
    )
    .expect("defs");
    let template = tpl("      - type: text\n        text: static\n");
    let diags = validate(Some(&defs), &template, None);
    let keys: Vec<String> = find(&diags, "definitions_format_ignored")
        .iter()
        .map(|d| key_of(d))
        .collect();
    assert_eq!(keys, vec!["order.code", "rows.at"], "{diags:?}");
}

#[test]
fn enum_labels_on_a_non_text_field_warn_and_name_the_effective_type() {
    // Labels are display words for a plain text value; every other type
    // renders through its own formatter, which has nowhere to put them.
    // Validated with NO params — a schema-quality warning must not depend
    // on data being supplied.
    let defs = parse_definitions(
        r#"
type: object
properties:
  status:
    type: string
    enum:
      - { value: shipped, label: 出荷済み }
  rank:
    type: integer
    enum:
      - { value: 1, label: 一号 }
  due:
    type: string
    format: date
    enum:
      - { value: "2026-01-01", label: 期首 }
  plain:
    type: integer
    enum: [1, 2]
"#,
    )
    .expect("defs");
    let template = tpl("      - type: text\n        text: static\n");
    let diags = validate(Some(&defs), &template, None);
    let found = find(&diags, "definitions_enum_labels_ignored");
    let keys: Vec<String> = found.iter().map(|d| key_of(d)).collect();
    // `status` is text (labels apply); `plain` declares none; a `date`
    // field is not text however it spells its base type.
    assert_eq!(keys, vec!["due", "rank"], "{diags:?}");
    assert!(
        found.iter().any(|d| d.message.contains("`date`")),
        "the effective type is what the message names: {found:?}"
    );
}

#[test]
fn an_array_without_an_items_schema_checks_only_its_length() {
    let defs =
        parse_definitions("type: object\nproperties:\n  tags:\n    type: array\n    maxItems: 2\n")
            .expect("defs");
    let template = tpl("      - type: text\n        text: static\n");
    let ok = validate(Some(&defs), &template, Some(&json!({ "tags": [1, "two"] })));
    assert!(find(&ok, "params_type_mismatch").is_empty(), "{ok:?}");
    let over = validate(Some(&defs), &template, Some(&json!({ "tags": [1, 2, 3] })));
    assert_eq!(
        find(&over, "params_length_out_of_range").len(),
        1,
        "{over:?}"
    );
}
