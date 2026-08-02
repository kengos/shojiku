//! `row.conditionalStyles` validation: the predicate key against the
//! bound array group, the boolean hint for an `equals`-less entry, the
//! entry cap, and the entries' own `styleNames`.

use super::*;

fn rdefs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  rows:
    type: array
    items:
      type: object
      properties:
        label:
          type: string
        kind:
          type: string
        flagged:
          type: boolean
        tags:
          type: array
          items:
            type: string
"#,
    )
    .expect("defs")
}

/// A table over `rows` carrying the given conditional entries.
fn conditional_table(entries: &str) -> Template {
    tpl(&format!(
        "      - type: table\n        data: {{ key: rows }}\n        row:\n          conditionalStyles:\n{entries}        columns:\n          - data: {{ key: label }}\n"
    ))
}

fn has(diags: &Diagnostics, code: &str) -> bool {
    diags.iter().any(|d| d.code == code)
}

#[test]
fn an_unknown_predicate_key_is_reported_against_the_array_group() {
    let t = conditional_table("            - when: { key: nope, equals: x }\n");
    let diags = validate(Some(&rdefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("unknown key");
    assert!(d.message.contains("nope"));
    assert_eq!(
        d.path.as_deref(),
        Some("sections.body.items[0].row.conditionalStyles[0]")
    );
}

#[test]
fn a_declared_row_key_passes() {
    let t = conditional_table("            - when: { key: kind, equals: heading }\n");
    let diags = validate(Some(&rdefs()), &t, None);
    assert!(!has(&diags, "unknown_data_key"), "diags: {diags:?}");
    assert!(
        !has(&diags, "row_condition_not_boolean"),
        "diags: {diags:?}"
    );
}

#[test]
fn an_equals_less_entry_on_a_non_boolean_field_warns() {
    let t = conditional_table("            - when: { key: kind }\n");
    let diags = validate(Some(&rdefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "row_condition_not_boolean")
        .expect("boolean hint");
    assert!(d.message.contains("kind"));
    assert_eq!(
        d.path.as_deref(),
        Some("sections.body.items[0].row.conditionalStyles[0]")
    );
}

#[test]
fn an_equals_less_entry_on_a_boolean_field_is_clean() {
    let t = conditional_table("            - when: { key: flagged }\n");
    assert!(!has(
        &validate(Some(&rdefs()), &t, None),
        "row_condition_not_boolean"
    ));
}

#[test]
fn an_equals_less_entry_on_a_row_array_field_warns_but_with_equals_passes() {
    // A row-level array is a known key with no scalar type: the
    // multi-select `equals` contains form is fine, the boolean one is not.
    let bare = conditional_table("            - when: { key: tags }\n");
    let diags = validate(Some(&rdefs()), &bare, None);
    assert!(!has(&diags, "unknown_data_key"), "diags: {diags:?}");
    assert!(has(&diags, "row_condition_not_boolean"), "diags: {diags:?}");

    let with_equals = conditional_table("            - when: { key: tags, equals: urgent }\n");
    let diags = validate(Some(&rdefs()), &with_equals, None);
    assert!(!has(&diags, "unknown_data_key"), "diags: {diags:?}");
    assert!(
        !has(&diags, "row_condition_not_boolean"),
        "diags: {diags:?}"
    );
}

#[test]
fn entries_past_the_cap_warn() {
    let mut entries = String::new();
    for _ in 0..(MAX_ROW_CONDITIONAL_STYLES + 1) {
        entries.push_str("            - when: { key: kind, equals: x }\n");
    }
    let t = conditional_table(&entries);
    let diags = validate(Some(&rdefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "too_many_row_conditions")
        .expect("cap warning");
    assert!(d.message.contains("17"), "message: {}", d.message);
    assert_eq!(d.path.as_deref(), Some("sections.body.items[0]"));
}

#[test]
fn exactly_the_cap_is_not_over_it() {
    let mut entries = String::new();
    for _ in 0..MAX_ROW_CONDITIONAL_STYLES {
        entries.push_str("            - when: { key: kind, equals: x }\n");
    }
    let t = conditional_table(&entries);
    assert!(!has(
        &validate(Some(&rdefs()), &t, None),
        "too_many_row_conditions"
    ));
}

#[test]
fn the_cap_is_checked_without_definitions_too() {
    let mut entries = String::new();
    for _ in 0..(MAX_ROW_CONDITIONAL_STYLES + 1) {
        entries.push_str("            - when: { key: kind, equals: x }\n");
    }
    let t = conditional_table(&entries);
    assert!(has(&validate(None, &t, None), "too_many_row_conditions"));
}

#[test]
fn an_entrys_undefined_style_name_is_reported_at_the_entrys_path() {
    let t = conditional_table(
        "            - when: { key: kind, equals: x }\n              styleNames: [nope]\n",
    );
    let diags = validate(Some(&rdefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "undefined_style_name")
        .expect("undefined style");
    assert_eq!(
        d.path.as_deref(),
        Some("sections.body.items[0].row.conditionalStyles[0]")
    );
}
