//! What an item's `visible:` binding can be checked against before any
//! params exist — the same four faults a form mark carries, under this
//! surface's own codes.
//!
//! The walk is shared with the marks (`validate/presence.rs`), so these
//! also pin that `visible:` is reached on item types that carry no mark
//! at all, which is the half a mark fixture could never exercise.

use super::*;
use crate::definitions::parse_definitions;

fn vdefs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  status:
    type: string
    enum: [draft, approved]
  paid:
    type: boolean
  count:
    type: number
"#,
    )
    .expect("defs")
}

fn has(diags: &Diagnostics, code: &str) -> bool {
    diags.iter().any(|d| d.code == code)
}

#[test]
fn a_key_declared_nowhere_is_an_error() {
    let t = tpl(r#"
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        visible: { key: ghost }
"#);
    let d = validate(Some(&vdefs()), &t, None);
    assert!(d.has_errors());
    assert!(has(&d, "unknown_data_key"));
}

#[test]
fn an_equals_less_binding_on_a_non_boolean_field_warns() {
    // `status` is a string: with no `equals` the value is read as a
    // boolean, so this predicate can never hold.
    let t = tpl(r#"
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        visible: { key: status }
"#);
    assert!(has(
        &validate(Some(&vdefs()), &t, None),
        "visible_not_boolean"
    ));
}

#[test]
fn an_equals_outside_the_declared_enum_warns() {
    let t = tpl(r#"
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        visible: { key: status, equals: shipped }
"#);
    assert!(has(
        &validate(Some(&vdefs()), &t, None),
        "visible_equals_not_declared"
    ));
}

#[test]
fn an_equals_of_the_wrong_scalar_kind_warns() {
    // `count` is a number; a string literal can never equal it.
    let t = tpl(r#"
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        visible: { key: count, equals: "2" }
"#);
    assert!(has(
        &validate(Some(&vdefs()), &t, None),
        "visible_type_mismatch"
    ));
}

#[test]
fn a_well_formed_binding_is_clean() {
    let t = tpl(r#"
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        visible: { key: status, equals: approved }
      - type: text
        text: hi
        visible: { key: paid }
"#);
    let d = validate(Some(&vdefs()), &t, None);
    assert!(!has(&d, "visible_not_boolean"), "{d:?}");
    assert!(!has(&d, "visible_type_mismatch"), "{d:?}");
    assert!(!has(&d, "visible_equals_not_declared"), "{d:?}");
}

#[test]
fn the_check_reaches_item_types_that_carry_no_mark() {
    // The walk was a MARK walk before `visible:` joined it, so its
    // type-specific arms only ever visited `ellipse`/`checkbox`/`text`.
    // A fault on a `qr_code` proves the new hook runs for every item.
    let t = tpl(r#"
      - type: qr_code
        box: { x: 0, y: 0, w: 40, h: 40 }
        text: hello
        visible: { key: status }
"#);
    assert!(has(
        &validate(Some(&vdefs()), &t, None),
        "visible_not_boolean"
    ));
}

#[test]
fn the_check_descends_into_a_repeat_cell_at_element_scope() {
    let t = tpl(r#"
      - type: repeat
        data: { key: rows }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: rect
              box: { x: 0, y: 0, w: 10, h: 10 }
              visible: { key: ghost }
"#);
    let defs = parse_definitions(
        r#"
type: object
properties:
  rows:
    type: array
    items:
      type: object
      properties:
        flagged:
          type: boolean
"#,
    )
    .expect("defs");
    let d = validate(Some(&defs), &t, None);
    // `ghost` is declared nowhere — not on the element, and (with the scope
    // escape below now honoured) not at document scope either.
    assert!(has(&d, "unknown_data_key"), "{d:?}");
}

#[test]
fn scope_document_inside_a_cell_resolves_against_top_level_params() {
    // The escape the feature documents: a page-global flag hiding an item
    // inside every `repeat` element. Layout has always honoured it; validate
    // resolved the key against the ARRAY GROUP regardless, so this correct
    // template reported `unknown_data_key` — an ERROR, red in the CLI and in
    // the Designer's diagnostics panel.
    let t = tpl(r#"
      - type: repeat
        data: { key: rows }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: rect
              box: { x: 0, y: 0, w: 10, h: 10 }
              visible: { key: paid, scope: document }
"#);
    let d = validate(Some(&scoped_defs()), &t, None);
    assert!(!has(&d, "unknown_data_key"), "{d:?}");
    assert!(!d.has_errors(), "{d:?}");
}

#[test]
fn a_document_scoped_key_that_is_declared_nowhere_still_errors() {
    // The escape must not become a blanket amnesty: an undeclared key is
    // still undeclared once it is resolved at document scope.
    let t = tpl(r#"
      - type: repeat
        data: { key: rows }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: rect
              box: { x: 0, y: 0, w: 10, h: 10 }
              visible: { key: ghost, scope: document }
"#);
    assert!(has(
        &validate(Some(&scoped_defs()), &t, None),
        "unknown_data_key"
    ));
}

#[test]
fn a_form_mark_takes_the_same_scope_escape() {
    // The walk is shared, so the mark's `data:` gains the fix with it — the
    // two presence surfaces cannot drift apart on what `scope:` means.
    let t = tpl(r#"
      - type: repeat
        data: { key: rows }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: checkbox
              box: { x: 0, y: 0, w: 10, h: 10 }
              data: { key: paid, scope: document }
"#);
    let d = validate(Some(&scoped_defs()), &t, None);
    assert!(!has(&d, "unknown_data_key"), "{d:?}");
}

/// Definitions with a top-level boolean AND a `rows` array, so a key can be
/// checked at both scopes.
fn scoped_defs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  paid:
    type: boolean
  rows:
    type: array
    items:
      type: object
      properties:
        name:
          type: string
"#,
    )
    .expect("defs")
}
