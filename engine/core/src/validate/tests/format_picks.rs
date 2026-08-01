//! Format-pick validation: registry names and the builtin currency
//! variants pass the declared-variant check.

use super::*;

/// A schema with one plain number field that declares a formats list
/// NOT containing the currency variants (so the declared-check alone
/// would warn).
fn number_defs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  subtotal:
    type: number
    displayFormats:
      - id: default
"#,
    )
    .expect("definitions")
}

#[test]
fn currency_variants_pass_on_a_plain_number_field() {
    // `symbol`/`name` on a declared number coerce the value to currency
    // at render, so validate accepts them as known picks.
    let template = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        data: { key: subtotal, format: symbol }
      - type: text
        data: { key: subtotal, format: name }
"#,
    )
    .expect("template");
    let diags = validate(Some(&number_defs()), &template, None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
}

#[test]
fn an_unknown_pick_on_a_number_field_still_warns() {
    let template = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        data: { key: subtotal, format: fancy }
"#,
    )
    .expect("template");
    let diags = validate(Some(&number_defs()), &template, None);
    assert_eq!(diags.items.len(), 1, "diagnostics: {diags:?}");
    assert_eq!(diags.items[0].code, "unknown_format");
}

#[test]
fn currency_variants_and_registry_names_are_known_picks() {
    // `symbol` is not in order.total's declared formats, but the currency-variant
    // builtin currency variants always pass; a template `formats:`
    // registry name passes for any type.
    let template = parse_template(
        r#"
formats:
  stamp: { type: datetime, pattern: "yyyy.MM.dd" }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        data: { key: order.total, format: symbol }
      - type: text
        data: { key: order.ordered_at, format: stamp }
"#,
    )
    .expect("template");
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
}

#[test]
fn the_value_pick_passes_on_a_labeled_enum_field_despite_declared_formats() {
    // `value` is the label escape — valid without being declared, like
    // the currency variants. The field deliberately DECLARES a variant
    // list, since an empty list already admits anything.
    let defs = parse_definitions(
        r#"
type: object
properties:
  status:
    type: string
    displayFormats:
      - id: default
    enum:
      - { value: backorder, label: 入荷待ち }
"#,
    )
    .expect("definitions");
    let template = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        data: { key: status, format: value }
      - type: text
        text: "{status:value}"
"#,
    )
    .expect("template");
    let diags = validate(Some(&defs), &template, None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
}

#[test]
fn the_value_pick_on_an_unlabeled_field_with_declared_formats_still_warns() {
    // Without labels there is nothing to escape from, so `value` is as
    // unknown as any other undeclared pick.
    let defs = parse_definitions(
        r#"
type: object
properties:
  code:
    type: string
    displayFormats:
      - id: default
"#,
    )
    .expect("definitions");
    let template = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        data: { key: code, format: value }
"#,
    )
    .expect("template");
    let diags = validate(Some(&defs), &template, None);
    assert_eq!(diags.items.len(), 1, "diagnostics: {diags:?}");
    assert_eq!(diags.items[0].code, "unknown_format");
}
