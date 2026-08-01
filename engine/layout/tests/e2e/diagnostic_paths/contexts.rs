//! Where a warning is raised from: each placement context stamps the
//! path its own box index would use, and nesting resolves to the
//! deepest node rather than an enclosing one.

use super::{by_code, flow_body, only};
use crate::common::*;

#[test]
fn two_items_with_the_same_problem_warn_once_each_with_their_own_paths() {
    // Both items overflow their fixed height by the same amount, so the
    // rendered messages are identical: before the walk stamped paths,
    // `dedup` collapsed the pair into ONE anonymous warning and the
    // author could not tell which item was broken.
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: text\n",
            "        box: { w: 100, h: 8 }\n",
            "        text: この行は箱の高さに収まらない長い文章です\n",
            "      - type: text\n",
            "        box: { w: 100, h: 8 }\n",
            "        text: こちらも同じように収まらない別の文章です\n",
        )),
        json!({}),
    );
    let overflows = by_code(&diags, "text_overflow");
    assert_eq!(overflows.len(), 2, "one per broken item: {diags:?}");
    let paths: Vec<_> = overflows.iter().map(|d| d.path.as_deref()).collect();
    assert_eq!(
        paths,
        vec![
            Some("sections.body.items[0]"),
            Some("sections.body.items[1]")
        ]
    );
    // Identical messages: the paths are what tell them apart.
    assert_eq!(overflows[0].message, overflows[1].message);
}

#[test]
fn a_nested_child_is_named_not_its_container() {
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: container\n",
            "        box: { w: 200, h: 100 }\n",
            "        items:\n",
            "          - type: text\n",
            "            text: hi\n",
            "          - type: rect\n",
            "            box: { w: 100 }\n",
        )),
        json!({}),
    );
    // The rect has no `h`: the container is one level up, and the
    // deepest node that saw the warning wins.
    assert_eq!(
        only(&diags, "rect_missing_size").path.as_deref(),
        Some("sections.body.items[0].items[1]")
    );
}

#[test]
fn a_band_item_carries_its_bands_path() {
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: text
        box: { x: 0, y: 0, w: 100, h: 10 }
        text: title
      - type: rect
        box: { w: 100 }
  body:
    type: flow
    box: { x: 0, y: 100, w: 300, h: 400 }
    items:
      - type: text
        text: body
"#,
        json!({}),
    );
    assert_eq!(
        only(&diags, "rect_missing_size").path.as_deref(),
        Some("sections.header.items[1]")
    );
}

#[test]
fn a_repeat_cell_child_carries_the_cell_path() {
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: repeat\n",
            "        data: { key: cells }\n",
            "        grid: { columns: 1, rows: 1 }\n",
            "        cell:\n",
            "          items:\n",
            "            - type: rect\n",
            "              box: { w: 50 }\n",
        )),
        json!({ "cells": [{}] }),
    );
    // The same address the box index uses for a cell's children, so a
    // diagnostic and a canvas box point at one template node.
    assert_eq!(
        only(&diags, "rect_missing_size").path.as_deref(),
        Some("sections.body.items[0].cell.items[0]")
    );
}

#[test]
fn an_absolute_body_item_carries_its_path() {
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 100, h: 10 }
        text: first
      - type: rect
        box: { w: 100 }
"#,
        json!({}),
    );
    assert_eq!(
        only(&diags, "rect_missing_size").path.as_deref(),
        Some("sections.body.items[1]")
    );
}

#[test]
fn every_warning_from_the_walk_is_located() {
    // One document, many unrelated problems across several item kinds and
    // nesting levels: the acceptance criterion is that a diagnostic raised
    // while an item is being laid out always names it.
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: rect\n        box: { w: 100 }\n",
            "      - type: text\n        box: { w: 100, h: 8 }\n",
            "        text: この行は箱の高さに収まらない長い文章です\n",
            "      - type: image\n        box: { w: 10, h: 10 }\n",
            "      - type: qr_code\n        box: { w: 0, h: 0 }\n        text: x\n",
            "      - type: text\n        box: { w: 100, h: 20 }\n",
            "        data: { key: absent }\n",
            "      - type: container\n",
            "        items:\n",
            "          - type: text\n            box: { y: \"10%\" }\n            text: hi\n",
            "          - type: checkbox\n            box: { x: 0, y: 0, w: 10, h: 10 }\n",
            "            data: { key: flag }\n",
        )),
        json!({ "flag": "not a bool" }),
    );
    assert!(
        diags.len() >= 6,
        "fixture stopped provoking warnings: {diags:?}"
    );
    let unlocated: Vec<&str> = diags
        .iter()
        .filter(|d| d.path.is_none())
        .map(|d| d.code.as_str())
        .collect();
    assert!(
        unlocated.is_empty(),
        "these were raised inside the walk but name no item: {unlocated:?}"
    );
    // The document-scope codes are absent here by construction, so the
    // sweep above is not vacuously passing on an allowlist.
    assert!(
        !diags
            .iter()
            .any(|d| super::DOCUMENT_SCOPE.contains(&d.code.as_str())),
        "{diags:?}"
    );
}

#[test]
fn a_once_per_key_warning_names_the_first_item_that_triggered_it() {
    // The warning ledgers exist so one bad `fontFamily` warns once, not
    // per item — so the located form names the FIRST offender. Documented
    // in docs/engine/diagnostics.md; pinned here because a jump target to
    // one real offender is the whole value of it.
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: text\n        text: first\n",
            "        style: { fontFamily: no-such-family }\n",
            "      - type: text\n        text: second\n",
            "        style: { fontFamily: no-such-family }\n",
        )),
        json!({}),
    );
    let unknown = only(&diags, "unknown_font_family");
    assert_eq!(unknown.path.as_deref(), Some("sections.body.items[0]"));
}
