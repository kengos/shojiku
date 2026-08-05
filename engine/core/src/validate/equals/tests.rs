//! The `equals`-against-the-declaration truth table, unit-tested away
//! from either surface that consumes it.

use super::*;
use crate::definitions::parse_definitions;

fn catalog() -> Catalog {
    let defs = parse_definitions(
        r#"
type: object
properties:
  status:
    type: string
    enum:
      - draft
      - { value: sent, label: 送付済み }
  amount:
    type: number
    format: currency
  flagged:
    type: boolean
  free_text:
    type: string
  causes:
    type: array
    items:
      type: string
      enum: [fire, flood]
  bare_list:
    type: array
  rows:
    type: array
    items:
      type: object
      properties:
        kind:
          type: string
          enum: [heading, total]
        tags:
          type: array
          items:
            type: string
"#,
    )
    .expect("defs");
    Catalog::from_definitions(&defs)
}

fn equals(value: serde_json::Value) -> EqualsValue {
    EqualsValue(value)
}

/// The fault a literal produces against a document-scope key, as a word —
/// so a case reads as its outcome rather than as a match arm.
fn fault_of(key: &str, value: serde_json::Value) -> &'static str {
    let catalog = catalog();
    let target = resolve_target(&catalog, None, key).expect("declared key");
    match equals_fault(&target, &equals(value)) {
        None => "ok",
        Some(EqualsFault::Kind) => "kind",
        Some(EqualsFault::NotDeclared) => "not_declared",
    }
}

#[test]
fn a_literal_of_the_declared_kind_and_enum_passes() {
    assert_eq!(fault_of("status", serde_json::json!("sent")), "ok");
    assert_eq!(fault_of("amount", serde_json::json!(120)), "ok");
    assert_eq!(fault_of("flagged", serde_json::json!(true)), "ok");
    assert_eq!(fault_of("free_text", serde_json::json!("anything")), "ok");
}

#[test]
fn a_literal_of_another_kind_is_a_kind_fault() {
    // Type-strict equality: `"2"` never equals `2`, whichever side is
    // which, so both directions are the same finding.
    assert_eq!(fault_of("amount", serde_json::json!("120")), "kind");
    assert_eq!(fault_of("status", serde_json::json!(2)), "kind");
    assert_eq!(fault_of("flagged", serde_json::json!("true")), "kind");
}

#[test]
fn a_literal_outside_a_declared_enum_is_not_declared() {
    assert_eq!(
        fault_of("status", serde_json::json!("posted")),
        "not_declared"
    );
    // A LABELED member is matched by its value, never by its label.
    assert_eq!(
        fault_of("status", serde_json::json!("送付済み")),
        "not_declared"
    );
}

#[test]
fn a_field_with_no_enum_accepts_any_literal_of_its_kind() {
    assert_eq!(fault_of("free_text", serde_json::json!("whatever")), "ok");
}

#[test]
fn an_array_source_is_checked_against_its_element() {
    let catalog = catalog();
    let target = resolve_target(&catalog, None, "causes").expect("array source");
    assert!(!reads_as_boolean(&target));
    assert!(equals_fault(&target, &equals(serde_json::json!("fire"))).is_none());
    assert!(matches!(
        equals_fault(&target, &equals(serde_json::json!("quake"))),
        Some(EqualsFault::NotDeclared)
    ));
    assert!(matches!(
        equals_fault(&target, &equals(serde_json::json!(2))),
        Some(EqualsFault::Kind)
    ));
}

#[test]
fn an_array_with_no_declared_items_claims_nothing() {
    let catalog = catalog();
    let target = resolve_target(&catalog, None, "bare_list").expect("array source");
    assert!(!reads_as_boolean(&target));
    assert!(equals_fault(&target, &equals(serde_json::json!("anything"))).is_none());
}

#[test]
fn a_row_relative_key_resolves_inside_its_group() {
    let catalog = catalog();
    let target = resolve_target(&catalog, Some("rows"), "kind").expect("row field");
    assert!(!reads_as_boolean(&target));
    assert!(equals_fault(&target, &equals(serde_json::json!("total"))).is_none());
    assert!(matches!(
        equals_fault(&target, &equals(serde_json::json!("footer"))),
        Some(EqualsFault::NotDeclared)
    ));
}

#[test]
fn a_row_relative_array_resolves_to_its_own_element() {
    let catalog = catalog();
    let target = resolve_target(&catalog, Some("rows"), "tags").expect("row array");
    assert!(!reads_as_boolean(&target));
    // The nested source's element is a plain string: a string literal is
    // admissible, a number is not.
    assert!(equals_fault(&target, &equals(serde_json::json!("urgent"))).is_none());
    assert!(matches!(
        equals_fault(&target, &equals(serde_json::json!(1))),
        Some(EqualsFault::Kind)
    ));
}

#[test]
fn only_a_boolean_leaf_reads_as_a_boolean() {
    let catalog = catalog();
    let boolean = resolve_target(&catalog, None, "flagged").expect("declared");
    assert!(reads_as_boolean(&boolean));
    // An array of booleans still does not: the VALUE is a list.
    let text = resolve_target(&catalog, None, "status").expect("declared");
    assert!(!reads_as_boolean(&text));
}

#[test]
fn an_undeclared_key_resolves_to_nothing() {
    let catalog = catalog();
    assert!(resolve_target(&catalog, None, "nope").is_none());
    assert!(resolve_target(&catalog, Some("rows"), "nope").is_none());
}

#[test]
fn a_date_or_image_field_takes_a_string_literal() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  due:
    type: string
    format: date
  logo:
    type: string
    format: image
"#,
    )
    .expect("defs");
    let catalog = Catalog::from_definitions(&defs);
    for key in ["due", "logo"] {
        let target = resolve_target(&catalog, None, key).expect("declared");
        assert!(equals_fault(&target, &equals(serde_json::json!("2026-03-14"))).is_none());
        assert!(matches!(
            equals_fault(&target, &equals(serde_json::json!(20260314))),
            Some(EqualsFault::Kind)
        ));
    }
}
