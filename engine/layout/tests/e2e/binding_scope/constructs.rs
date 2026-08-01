//! The escape across the three data-scoped constructs (`repeat` cell,
//! `repeat_flow` card, table `cell:` column) plus its inert behavior
//! outside them.

use crate::common::*;

/// Both scopes carry the SAME key, so a passing assertion can only come
/// from the scope branch — not from a fallback that happens to find the
/// value somewhere.
fn params() -> Value {
    json!({
        "store": "本店",
        "cells": [{ "store": "支店A", "code": "A-1" }, { "store": "支店B", "code": "B-2" }],
    })
}

fn texts(page: &LayoutPage) -> Vec<String> {
    text_blocks(page)
        .into_iter()
        .map(|b| b.lines[0].text.clone())
        .collect()
}

#[test]
fn a_repeat_cell_reads_top_level_params_through_the_escape() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: store, scope: document }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // Both cells print the DOCUMENT store, not their own element's.
    assert_eq!(texts(&doc.pages[0]), vec!["本店", "本店"]);
}

#[test]
fn the_default_scope_still_reads_the_element() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: store }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    assert_eq!(texts(&doc.pages[0]), vec!["支店A", "支店B"]);
}

#[test]
fn a_repeat_flow_card_takes_the_same_escape() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        data: { key: cells }
        item:
          box: { h: 30 }
          items:
            - type: text
              data: { key: store, scope: document }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(texts(&doc.pages[0]), vec!["本店", "本店"]);
}

#[test]
fn a_table_cell_column_takes_the_same_escape() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: table
        data: { key: cells }
        columns:
          - cell:
              items:
                - type: text
                  data: { key: store, scope: document }
                  style: { fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(texts(&doc.pages[0]), vec!["本店", "本店"]);
}

#[test]
fn the_escape_is_inert_outside_a_scoped_construct() {
    // A sub-template must compose the same way in and out of a `repeat`,
    // so `scope: document` at the document level is a silent no-op.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        data: { key: store, scope: document }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(texts(&doc.pages[0]), vec!["本店"]);
}

#[test]
fn a_missing_document_key_warns_at_the_document_scope() {
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: code, scope: document }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    // `code` exists on every ELEMENT but not at the top level, so the
    // escape must report it missing rather than quietly finding it.
    assert!(
        diags
            .items
            .iter()
            .any(|d| d.code.as_str() == "missing_data"),
        "{diags:?}"
    );
}

#[test]
fn a_placeholder_still_covers_a_blank_document_value() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: memo, scope: document, placeholder: "———" }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "memo": "", "cells": [{ "code": "A-1" }] }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(texts(&doc.pages[0]), vec!["———"]);
}

#[test]
fn interpolation_keeps_the_element_scope() {
    // `{key}` carries no scope slot by design; the documented escape for
    // a mixed line is a `spans` entry with its own `data:`.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              text: "{store}"
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    assert_eq!(texts(&doc.pages[0]), vec!["支店A", "支店B"]);
}

#[test]
fn a_hostile_document_scoped_key_resolves_without_panicking() {
    // A very long, deeply dotted key reaches the same `resolve_path`
    // guards the ambient scope uses: it simply finds nothing and warns.
    let key = format!("{}leaf", "a.".repeat(200));
    let (doc, diags) = run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: repeat
        data: {{ key: cells }}
        grid: {{ columns: 1, rows: 1 }}
        cell:
          items:
            - type: text
              box: {{ x: 0, y: 0 }}
              data: {{ key: "{key}", scope: document }}
              style: {{ fontSize: 10, lineHeight: 1.0 }}
"#
        ),
        params(),
    );
    // One 1×1 page per bound element, and a bounded diagnostic rather
    // than a panic or an echoed key walk.
    assert_eq!(doc.pages.len(), 2);
    assert!(
        diags
            .items
            .iter()
            .any(|d| d.code.as_str() == "missing_data"),
        "{diags:?}"
    );
}
