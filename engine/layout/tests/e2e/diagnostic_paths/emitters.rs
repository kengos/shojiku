//! Who raises the warning. The stamp is applied by the walk, not by the
//! emit site, so these cover the emitters that have no `Ctx` to ask —
//! and the document level, which must stay unlocated.

use super::{flow_body, only};
use crate::common::*;

#[test]
fn the_flow_layouters_overflow_warning_names_the_item() {
    // Raised by `engine/flow/layouter.rs::place`, a free function with no
    // `Ctx` — it pushes into the shared list inside the item's window.
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 300 }
    items:
      - type: rect
        box: { w: 40, h: 10 }
      - type: rect
        box: { w: 300, h: 10 }
"#,
        json!({}),
    );
    let overflow = only(&diags, "flow_item_overflow");
    assert_eq!(overflow.path.as_deref(), Some("sections.body.items[1]"));
    assert_eq!(arg_num(overflow, "over"), Some(200.0));
}

#[test]
fn a_percent_dropped_by_the_box_crate_names_the_item() {
    // `percent_of_auto` comes from `shojiku-layout-box`, a pure crate
    // that knows nothing about paths; the enclosing walk supplies it.
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: container\n",
            "        items:\n",
            "          - type: text\n",
            "            box: { y: \"10%\" }\n",
            "            text: hi\n",
        )),
        json!({}),
    );
    assert_eq!(
        only(&diags, "percent_of_auto").path.as_deref(),
        Some("sections.body.items[0].items[0]")
    );
}

#[test]
fn a_missing_data_key_names_the_item_and_still_reports_the_key() {
    // The key rides in `args` (and so in the message); `path` is the
    // template address, which is what a jump-to-item needs.
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: text\n",
            "        box: { w: 100, h: 20 }\n",
            "        data: { key: customer.name }\n",
        )),
        json!({}),
    );
    let missing = only(&diags, "missing_data");
    assert_eq!(missing.path.as_deref(), Some("sections.body.items[0]"));
    assert!(missing.message.contains("customer.name"), "{missing:?}");
}

#[test]
fn a_list_bound_to_a_non_array_names_the_item() {
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: list\n",
            "        box: { w: 200, h: 40 }\n",
            "        data: { key: lines }\n",
        )),
        json!({ "lines": "not an array" }),
    );
    let not_array = only(&diags, "not_an_array");
    assert_eq!(not_array.path.as_deref(), Some("sections.body.items[0]"));
    assert!(not_array.message.contains("lines"), "{not_array:?}");
}

#[test]
fn a_table_bound_to_a_missing_key_names_the_table() {
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: table\n",
            "        data: { key: absent }\n",
            "        columns:\n",
            "          - { label: 名前, data: { key: name }, width: 100 }\n",
        )),
        json!({}),
    );
    let missing = only(&diags, "missing_data");
    assert_eq!(missing.path.as_deref(), Some("sections.body.items[0]"));
    assert!(missing.message.contains("absent"), "{missing:?}");
}

#[test]
fn a_repeat_bound_to_a_non_array_names_the_repeat() {
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: repeat\n",
            "        data: { key: cells }\n",
            "        grid: { columns: 1, rows: 1 }\n",
            "        cell:\n",
            "          items:\n",
            "            - { type: rect, box: { w: 10, h: 10 } }\n",
        )),
        json!({ "cells": "not an array" }),
    );
    let not_array = only(&diags, "not_an_array");
    assert_eq!(not_array.path.as_deref(), Some("sections.body.items[0]"));
    assert!(not_array.message.contains("cells"), "{not_array:?}");
}

#[test]
fn a_marks_non_boolean_value_names_the_item() {
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: checkbox\n",
            "        box: { x: 0, y: 0, w: 10, h: 10 }\n",
            "        data: { key: agree }\n",
        )),
        json!({ "agree": "yes" }),
    );
    let not_bool = only(&diags, "mark_value_not_bool");
    assert_eq!(not_bool.path.as_deref(), Some("sections.body.items[0]"));
    assert!(not_bool.message.contains("agree"), "{not_bool:?}");
}

#[test]
fn a_document_level_warning_stays_unlocated() {
    // Raised before the walk descends into anything, so there is no item
    // to blame — a page-wide statement must not point at one.
    let (_, diags) = run(
        r#"
page: { size: A4, margin: { left: 400, right: 400 } }
sections:
  body:
    type: flow
    items:
      - type: text
        text: hi
"#,
        json!({}),
    );
    assert_eq!(only(&diags, "page_margin_too_large").path, None);
}

#[test]
fn orientation_ignored_stays_unlocated_for_its_root_scoped_quick_fix() {
    // The GUI's quick fix for this code removes the ROOT `page.orientation`
    // key and is the one fix builder that does not read `diag.path` — so a
    // path here would turn its row into a jump at an unrelated item.
    let (_, diags) = run(
        r#"
page: { size: { w: 300, h: 200 }, orientation: landscape, margin: 0 }
sections:
  body:
    type: flow
    items:
      - type: text
        text: hi
"#,
        json!({}),
    );
    assert_eq!(only(&diags, "orientation_ignored").path, None);
}
