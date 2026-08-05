//! The `equals` literal against what the field declares, on both
//! surfaces that carry one: form marks and table row conditions. A
//! predicate that can never hold for ANY params is a template mistake,
//! and both surfaces must report it the same way.

use super::*;

fn edefs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  status:
    type: string
    enum:
      - draft
      - { value: sent, label: 送付済み }
  score:
    type: number
  agreed:
    type: boolean
  causes:
    type: array
    items:
      type: string
      enum: [fire, flood]
  rows:
    type: array
    items:
      type: object
      properties:
        label:
          type: string
        kind:
          type: string
          enum: [heading, total]
"#,
    )
    .expect("defs")
}

fn only_codes(diags: &Diagnostics) -> Vec<&str> {
    diags.iter().map(|d| d.code.as_str()).collect()
}

fn checkbox(binding: &str) -> Template {
    tpl(&format!(
        "      - type: checkbox\n        box: {{ x: 10, y: 10, w: 10, h: 10 }}\n        data: {binding}\n"
    ))
}

fn condition(when: &str) -> Template {
    tpl(&format!(
        "      - type: table\n        data: {{ key: rows }}\n        row:\n          conditionalStyles:\n            - when: {when}\n              style: {{ backgroundColor: \"#eeeeee\" }}\n        columns:\n          - data: {{ key: label }}\n"
    ))
}

#[test]
fn a_mark_equals_of_the_wrong_kind_is_reported() {
    let t = checkbox("{ key: score, equals: \"3\" }");
    let diags = validate(Some(&edefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "mark_equals_type_mismatch")
        .expect("a string literal against a number field");
    assert!(d.message.contains("score"));
    assert_eq!(d.path.as_deref(), Some("sections.body.items[0]"));
}

#[test]
fn a_mark_equals_outside_the_declared_enum_is_reported() {
    let t = checkbox("{ key: status, equals: posted }");
    let diags = validate(Some(&edefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "mark_equals_not_declared")
        .expect("a value the enum does not list");
    assert!(d.message.contains("status"));
    // The literal itself is never echoed — only the key names the field.
    assert!(!d.message.contains("posted"), "{}", d.message);
}

#[test]
fn a_declared_member_passes_on_both_forms() {
    for binding in [
        "{ key: status, equals: sent }",
        "{ key: status, equals: draft }",
        "{ key: agreed }",
        "{ key: score, equals: 3 }",
    ] {
        let diags = validate(Some(&edefs()), &checkbox(binding), None);
        assert!(
            only_codes(&diags).is_empty(),
            "{binding} should be clean: {:?}",
            only_codes(&diags)
        );
    }
}

#[test]
fn a_multi_select_equals_is_checked_against_the_arrays_element() {
    let clean = validate(
        Some(&edefs()),
        &checkbox("{ key: causes, equals: fire }"),
        None,
    );
    assert!(only_codes(&clean).is_empty(), "{:?}", only_codes(&clean));

    let t = checkbox("{ key: causes, equals: quake }");
    let diags = validate(Some(&edefs()), &t, None);
    assert!(diags.iter().any(|d| d.code == "mark_equals_not_declared"));
}

#[test]
fn an_equals_less_mark_over_an_array_still_wants_a_boolean() {
    // The VALUE is a list whatever its elements are, so an `equals`-less
    // mark can never read it as a boolean.
    let t = checkbox("{ key: causes }");
    let diags = validate(Some(&edefs()), &t, None);
    assert!(diags.iter().any(|d| d.code == "mark_binding_not_boolean"));
}

#[test]
fn a_row_condition_equals_is_checked_the_same_way() {
    let kind = validate(Some(&edefs()), &condition("{ key: kind, equals: 2 }"), None);
    assert!(kind.iter().any(|d| d.code == "row_condition_type_mismatch"));

    let member = validate(
        Some(&edefs()),
        &condition("{ key: kind, equals: footer }"),
        None,
    );
    let d = member
        .iter()
        .find(|d| d.code == "row_condition_equals_not_declared")
        .expect("a value the enum does not list");
    assert!(d.message.contains("kind"));
    assert!(!d.message.contains("footer"), "{}", d.message);

    let good = validate(
        Some(&edefs()),
        &condition("{ key: kind, equals: heading }"),
        None,
    );
    assert!(only_codes(&good).is_empty(), "{:?}", only_codes(&good));
}

#[test]
fn a_field_with_no_enum_takes_any_literal_of_its_kind() {
    let good = validate(
        Some(&edefs()),
        &condition("{ key: label, equals: anything }"),
        None,
    );
    assert!(only_codes(&good).is_empty(), "{:?}", only_codes(&good));
}

#[test]
fn without_definitions_no_equals_claim_is_made() {
    for t in [
        checkbox("{ key: status, equals: posted }"),
        condition("{ key: kind, equals: footer }"),
    ] {
        let diags = validate(None, &t, None);
        assert!(
            !only_codes(&diags)
                .iter()
                .any(|code| code.contains("not_declared") || code.contains("type_mismatch")),
            "{:?}",
            only_codes(&diags)
        );
    }
}
