//! What a declaration can reach that a bare `{key}` cannot: top-level
//! params from inside each data-scoped construct. Both scopes carry the
//! SAME key, so a passing assertion can only come from the scope branch.

use crate::common::*;

fn params() -> Value {
    json!({
        "store": "本店",
        "cells": [
            { "store": "支店A", "code": "A-1" },
            { "store": "支店B", "code": "B-2" },
        ],
    })
}

/// A flow body holding `item` — `repeat` / `repeat_flow` / a flow table
/// all require one.
fn flow(item: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
defaults:
  style: {{ fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
{item}
"#
    )
}

/// The declared text item every construct nests, at `indent` columns.
fn escaping_text(indent: &str, scope: &str) -> String {
    let s = if scope.is_empty() {
        String::new()
    } else {
        format!(", scope: {scope}")
    };
    format!(
        "{indent}- type: text\n\
         {indent}  text: \"{{shop}}\"\n\
         {indent}  bindings:\n\
         {indent}    shop: {{ key: store{s} }}\n"
    )
}

#[test]
fn a_repeat_cell_reads_top_level_params_through_a_declaration() {
    let inner = escaping_text("            ", "document");
    let (doc, diags) = run(
        &flow(&format!(
            "      - type: repeat\n        data: {{ key: cells }}\n        grid: {{ columns: 1, rows: 2 }}\n        cell:\n          items:\n{inner}"
        )),
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // Both cells print the DOCUMENT store, not their own element's.
    assert_eq!(all_text(&doc.pages[0]), "本店\n本店");
}

#[test]
fn a_repeat_flow_card_reads_top_level_params_through_a_declaration() {
    let inner = escaping_text("            ", "document");
    let (doc, diags) = run(
        &flow(&format!(
            "      - type: repeat_flow\n        data: {{ key: cells }}\n        item:\n          items:\n{inner}"
        )),
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "本店\n本店");
}

#[test]
fn a_table_cell_column_reads_top_level_params_through_a_declaration() {
    let inner = escaping_text("                ", "document");
    let (doc, diags) = run(
        &flow(&format!(
            "      - type: table\n        data: {{ key: cells }}\n        columns:\n          - cell:\n              items:\n{inner}"
        )),
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // One row per element, each printing the document store.
    assert_eq!(all_text(&doc.pages[0]), "本店\n本店");
}

#[test]
fn one_line_can_mix_a_declared_document_name_with_undeclared_element_ones() {
    // The headline case: before declarations this line was unwritable —
    // interpolation had no scope slot, so mixing scopes meant rewriting
    // it as `spans`.
    let (doc, diags) = run(
        &flow(concat!(
            "      - type: repeat\n",
            "        data: { key: cells }\n",
            "        grid: { columns: 1, rows: 2 }\n",
            "        cell:\n",
            "          items:\n",
            "            - type: text\n",
            "              text: \"{shop} / {code} / {store}\"\n",
            "              bindings:\n",
            "                shop: { key: store, scope: document }\n",
        )),
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // `shop` escapes to the document; `code` and the UNDECLARED `store`
    // keep reading the bound element.
    assert_eq!(
        all_text(&doc.pages[0]),
        "本店 / A-1 / 支店A\n本店 / B-2 / 支店B"
    );
}

#[test]
fn the_default_scope_still_reads_the_bound_element() {
    // The SAME declaration without `scope:` must keep reading the row —
    // a declaration adds options, it does not change the ambient scope.
    let inner = escaping_text("            ", "");
    let (doc, diags) = run(
        &flow(&format!(
            "      - type: repeat\n        data: {{ key: cells }}\n        grid: {{ columns: 1, rows: 2 }}\n        cell:\n          items:\n{inner}"
        )),
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "支店A\n支店B");
}
