//! Form-mark validation: the checked×data conflict, key existence
//! (scalar + repeat-cell scope), and the boolean-type hint.

use super::*;
use crate::definitions::parse_definitions;

fn mdefs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  payment:
    type: string
  agree:
    type: boolean
  causes:
    type: array
    items:
      type: object
      properties:
        code:
          type: string
"#,
    )
    .expect("defs")
}

fn has(diags: &Diagnostics, code: &str) -> bool {
    diags.iter().any(|d| d.code == code)
}

#[test]
fn checkbox_checked_and_data_conflict_warns() {
    let t = tpl(r#"
      - type: checkbox
        box: { x: 0, y: 0, w: 10, h: 10 }
        checked: true
        data: { key: agree }
"#);
    assert!(has(
        &validate(Some(&mdefs()), &t, None),
        "mark_content_conflict"
    ));
}

#[test]
fn unknown_scalar_key_is_error() {
    let t = tpl(r#"
      - type: ellipse
        box: { x: 0, y: 0, w: 10, h: 10 }
        data: { key: ghost, equals: "x" }
"#);
    let d = validate(Some(&mdefs()), &t, None);
    assert!(d.has_errors());
    assert!(has(&d, "unknown_data_key"));
}

#[test]
fn boolean_binding_on_non_boolean_field_hints() {
    // No `equals` → boolean binding; `payment` is a string field.
    let t = tpl(r#"
      - type: checkbox
        box: { x: 0, y: 0, w: 10, h: 10 }
        data: { key: payment }
"#);
    assert!(has(
        &validate(Some(&mdefs()), &t, None),
        "mark_binding_not_boolean"
    ));
}

#[test]
fn boolean_binding_on_boolean_field_is_clean() {
    let t = tpl(r#"
      - type: checkbox
        box: { x: 0, y: 0, w: 10, h: 10 }
        data: { key: agree }
"#);
    assert!(!has(
        &validate(Some(&mdefs()), &t, None),
        "mark_binding_not_boolean"
    ));
}

#[test]
fn equals_suppresses_boolean_hint() {
    // With `equals`, a non-boolean field is fine.
    let t = tpl(r#"
      - type: ellipse
        box: { x: 0, y: 0, w: 10, h: 10 }
        data: { key: payment, equals: "カード" }
"#);
    assert!(!has(
        &validate(Some(&mdefs()), &t, None),
        "mark_binding_not_boolean"
    ));
}

#[test]
fn missing_params_value_warns() {
    let t = tpl(r#"
      - type: ellipse
        box: { x: 0, y: 0, w: 10, h: 10 }
        data: { key: payment, equals: "カード" }
"#);
    let params = json!({});
    assert!(has(
        &validate(Some(&mdefs()), &t, Some(&params)),
        "missing_data"
    ));
}

#[test]
fn no_definitions_means_no_unknown_key() {
    let t = tpl(r#"
      - type: checkbox
        box: { x: 0, y: 0, w: 10, h: 10 }
        data: { key: anything }
"#);
    assert!(!has(&validate(None, &t, None), "unknown_data_key"));
}

#[test]
fn cell_scope_key_checked_against_array_group() {
    // A declared array field passes; an undeclared one errors.
    let ok = tpl(r#"
      - type: repeat
        data: { key: causes }
        cell:
          items:
            - type: checkbox
              box: { x: 0, y: 0, w: 10, h: 10 }
              data: { key: code, equals: "1" }
"#);
    assert!(!has(
        &validate(Some(&mdefs()), &ok, None),
        "unknown_data_key"
    ));

    let bad = tpl(r#"
      - type: repeat
        data: { key: causes }
        cell:
          items:
            - type: checkbox
              box: { x: 0, y: 0, w: 10, h: 10 }
              data: { key: ghost, equals: "1" }
"#);
    assert!(has(
        &validate(Some(&mdefs()), &bad, None),
        "unknown_data_key"
    ));
}

#[test]
fn text_mark_key_is_checked_like_a_standalone_mark() {
    // Unknown key errors; a boolean-less binding on a string field hints.
    let ghost = tpl(r#"
      - type: text
        text: 現金
        mark: { data: { key: ghost, equals: cash } }
"#);
    assert!(has(
        &validate(Some(&mdefs()), &ghost, None),
        "unknown_data_key"
    ));

    let hint = tpl(r#"
      - type: text
        text: 現金
        mark: { data: { key: payment } }
"#);
    assert!(has(
        &validate(Some(&mdefs()), &hint, None),
        "mark_binding_not_boolean"
    ));
}

#[test]
fn text_mark_with_no_data_is_always_clean() {
    // A decoration mark (no `data:`) has no key to check.
    let t = tpl(r##"
      - type: text
        text: 見出し
        mark: { style: { borderColor: "#cc0000" } }
"##);
    let d = validate(Some(&mdefs()), &t, None);
    assert!(!d.has_errors() && !has(&d, "mark_binding_not_boolean"));
}

#[test]
fn text_mark_key_is_scoped_to_the_enclosing_repeat_element() {
    let t = tpl(r#"
      - type: repeat
        data: { key: causes }
        cell:
          items:
            - type: text
              text: "{code}"
              mark: { data: { key: code, equals: "1" } }
"#);
    assert!(!has(
        &validate(Some(&mdefs()), &t, None),
        "unknown_data_key"
    ));
}

#[test]
fn equals_mark_on_a_declared_array_key_is_known() {
    // The multi-select form: `equals` + an array-typed key (array-contains).
    // v2 declares the key truthfully as an array; the mark must not read
    // as an unknown key.
    let defs = parse_definitions(
        "type: object\nproperties:\n  methods:\n    type: array\n    items:\n      type: string\n",
    )
    .expect("defs");
    let t = tpl(r#"
      - type: checkbox
        box: { x: 0, y: 0, w: 10, h: 10 }
        data: { key: methods, equals: email }
"#);
    let d = validate(Some(&defs), &t, Some(&json!({ "methods": ["email"] })));
    assert!(!has(&d, "unknown_data_key"), "{d:?}");
    assert!(!has(&d, "mark_binding_not_boolean"), "{d:?}");
}

#[test]
fn equals_less_mark_on_an_array_key_warns_not_boolean() {
    let defs = parse_definitions(
        "type: object\nproperties:\n  methods:\n    type: array\n    items:\n      type: string\n",
    )
    .expect("defs");
    let t = tpl(r#"
      - type: checkbox
        box: { x: 0, y: 0, w: 10, h: 10 }
        data: { key: methods }
"#);
    assert!(has(
        &validate(Some(&defs), &t, None),
        "mark_binding_not_boolean"
    ));
}
