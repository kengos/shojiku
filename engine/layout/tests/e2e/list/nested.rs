//! A list bound to a NESTED array (a row's own array child): its entries
//! carry the field specs the schema declares for them, exactly as a
//! top-level list's do.
//!
//! Before the catalog gave a nested source its own dotted identity, the
//! entry scope carried the AUTHORED key (`items`) and the catalog is
//! keyed by the full path (`orders.items`), so every lookup missed and
//! `enum` labels, `placeholder` and format variants were silently inert
//! one level in — while the identical top-level list worked. The
//! asymmetry was invisible to the author, which is why each case below
//! asserts the nested and the top-level rendering together.

use crate::common::*;

const DEFS: &str = r#"
type: object
properties:
  releases:
    type: array
    items:
      type: object
      properties:
        state:
          type: string
          enum:
            - { value: open, label: 受付中 }
            - { value: done, label: 完了 }
        price:
          type: number
          format: currency
        note:
          type: string
          placeholder: （なし）
  orders:
    type: array
    items:
      type: object
      properties:
        code:
          type: string
        items:
          type: array
          items:
            type: object
            properties:
              state:
                type: string
                enum:
                  - { value: open, label: 受付中 }
                  - { value: done, label: 完了 }
              price:
                type: number
                format: currency
              note:
                type: string
                placeholder: （なし）
"#;

/// A `repeat` over `orders` whose single cell carries a list bound to the
/// row's own `items` array.
fn nested(text: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: repeat
        data: {{ key: orders }}
        cell:
          items:
            - type: list
              box: {{ w: 380, h: 60 }}
              data: {{ key: items }}
              text: "{text}"
              style: {{ fontSize: 10, lineHeight: 1.0 }}
"#
    )
}

/// The same list, bound to the top-level `releases` array instead.
fn top_level(text: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: list
        box: {{ w: 380, h: 60 }}
        data: {{ key: releases }}
        text: "{text}"
        style: {{ fontSize: 10, lineHeight: 1.0 }}
"#
    )
}

fn entries(value: Value) -> Value {
    json!({
        "releases": value.clone(),
        "orders": [{ "code": "SO-1", "items": value }],
    })
}

/// Every rendered line of the first page's first text block.
fn rendered(template: &str, params: Value) -> Vec<String> {
    let (doc, diags) = run_with_defs(template, DEFS, params);
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    super::lines_of(&doc.pages[0])
}

#[test]
fn a_nested_entry_renders_its_declared_enum_label() {
    let params = entries(json!([{ "state": "done" }, { "state": "open" }]));
    let expected = vec!["完了".to_string(), "受付中".to_string()];
    assert_eq!(rendered(&nested("{state}"), params.clone()), expected);
    assert_eq!(
        rendered(&top_level("{state}"), params),
        expected,
        "the top-level list is the control: both must render the labels"
    );
}

#[test]
fn a_nested_entry_renders_through_its_declared_field_type() {
    // `format: currency` makes the field currency-TYPED, so the number
    // renders grouped rather than as a bare JSON number.
    let params = entries(json!([{ "price": 300000 }]));
    let expected = vec!["300,000".to_string()];
    assert_eq!(rendered(&nested("{price}"), params.clone()), expected);
    assert_eq!(rendered(&top_level("{price}"), params), expected);
}

#[test]
fn a_nested_entrys_blank_value_draws_the_declared_placeholder() {
    let params = entries(json!([{ "note": "" }, { "note": "同梱" }]));
    let expected = vec!["（なし）".to_string(), "同梱".to_string()];
    assert_eq!(rendered(&nested("{note}"), params.clone()), expected);
    assert_eq!(rendered(&top_level("{note}"), params), expected);
}

#[test]
fn a_document_scoped_list_inside_a_cell_reads_the_top_level_array() {
    // The escape hatch: the entries are `releases`, so they resolve
    // against ITS element — not the row's own `items`.
    let template = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: orders }
        cell:
          items:
            - type: list
              box: { w: 380, h: 60 }
              data: { key: releases, scope: document }
              text: "{state}"
              style: { fontSize: 10, lineHeight: 1.0 }
"#;
    let params = json!({
        "releases": [{ "state": "done" }],
        "orders": [{ "code": "SO-1", "items": [{ "state": "open" }] }],
    });
    assert_eq!(rendered(template, params), vec!["完了".to_string()]);
}

#[test]
fn a_nested_list_renders_without_definitions_at_all() {
    // Definitions are validate-time: with none, the entries still draw —
    // as their raw values, with no spec to apply.
    let (doc, diags) = run(
        &nested("{state}"),
        entries(json!([{ "state": "done" }, { "state": "open" }])),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(
        super::lines_of(&doc.pages[0]),
        vec!["done".to_string(), "open".to_string()]
    );
}
