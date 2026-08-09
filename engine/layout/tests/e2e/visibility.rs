//! `visible:` — params-conditional item presence (mirrors src
//! `engine/visibility.rs`). This module covers the FLOW body, where the
//! two semantics differ most visibly, plus the `BoxIndex` half. The other
//! placement contexts live in `contexts`, the cases that reach past the
//! authoring item in `nested`, and the unusable-params ones in `faults`.
//!
//! Geometry is asserted with `rect`s, which need no font measurement, so
//! every y below is exact.

mod contexts;
mod faults;
mod nested;

use crate::common::*;
use serde_json::json;

/// Three stacked 30pt rects; the middle one binds `visible:`. `extra` is
/// spliced into that binding (`, collapse: true`), and `gap` into the
/// flow body — the two axes every flow case here varies.
pub fn stack(gap: &str, extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    {gap}
    items:
      - type: rect
        id: a
        style: {{ borderWidth: 1 }}
        box: {{ w: 50, h: 30 }}
      - type: rect
        id: b
        style: {{ borderWidth: 1 }}
        box: {{ w: 50, h: 30 }}
        visible: {{ key: show{extra} }}
      - type: rect
        id: c
        style: {{ borderWidth: 1 }}
        box: {{ w: 50, h: 30 }}
"#
    )
}

fn y_of(out: &shojiku_layout::LayoutOutput, id: &str) -> f64 {
    crate::boxes::find(&out.boxes.pages[0], id).border.y
}

#[test]
fn a_holding_predicate_draws_exactly_as_if_the_key_were_absent() {
    let shown = run_full(&stack("", ""), json!({ "show": true }));
    let plain = run_full(&stack("", ""), json!({}));
    // The regression baseline: nothing about an item that SHOWS differs
    // from the same item with no `visible:` at all.
    assert!(shown.diagnostics.is_empty(), "{:?}", shown.diagnostics);
    assert_eq!(rect_shapes(&shown.document.pages[0]).len(), 3);
    assert_eq!(y_of(&shown, "c"), y_of(&plain, "c"));
    assert_eq!(y_of(&shown, "c"), 60.0);
}

#[test]
fn hidden_draws_nothing_and_leaves_the_next_sibling_where_it_was() {
    let out = run_full(&stack("", ""), json!({ "show": false }));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    // Two rects painted, not three — the middle one reserved its box.
    assert_eq!(rect_shapes(&out.document.pages[0]).len(), 2);
    // …and `c` did not move: this is `visibility: hidden`, not `none`.
    assert_eq!(y_of(&out, "c"), 60.0);
    assert_eq!(
        y_of(&out, "b"),
        30.0,
        "the box is still reserved at its place"
    );
}

#[test]
fn collapsed_removes_the_box_and_the_next_sibling_moves_up_by_its_height() {
    let out = run_full(&stack("", ", collapse: true"), json!({ "show": false }));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert_eq!(rect_shapes(&out.document.pages[0]).len(), 2);
    // 60 -> 30: exactly the 30pt the collapsed item would have occupied.
    assert_eq!(y_of(&out, "c"), 30.0);
}

#[test]
fn collapsed_takes_its_gap_with_it() {
    // The case the design exists to catch: gap accounting keyed on
    // document POSITION would leave the collapsed item's gap behind.
    let shown = run_full(
        &stack("gap: 20", ", collapse: true"),
        json!({ "show": true }),
    );
    assert_eq!(y_of(&shown, "c"), 100.0, "30 + 20 + 30 + 20");

    let out = run_full(
        &stack("gap: 20", ", collapse: true"),
        json!({ "show": false }),
    );
    // One item height AND one gap, not just the height.
    assert_eq!(y_of(&out, "c"), 50.0, "30 + 20 — the middle gap went too");
}

#[test]
fn a_collapsed_first_item_leaves_no_leading_gap() {
    // The other end of the same rule: with the FIRST item gone, the
    // survivor starts at the top rather than one gap down.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    gap: 20
    items:
      - type: rect
        id: a
        style: { borderWidth: 1 }
        box: { w: 50, h: 30 }
        visible: { key: show, collapse: true }
      - type: rect
        id: b
        style: { borderWidth: 1 }
        box: { w: 50, h: 30 }
"#;
    let out = run_full(yaml, json!({ "show": false }));
    assert_eq!(y_of(&out, "b"), 0.0);
}

#[test]
fn a_hidden_item_still_reports_its_placement_stamped_hidden() {
    let out = run_full(&stack("", ""), json!({ "show": false }));
    let b = crate::boxes::find(&out.boxes.pages[0], "b");
    assert!(
        b.hidden,
        "a Designer needs to know WHERE the hidden item is"
    );
    assert_eq!(b.border.h, 30.0, "with its real geometry");
    // Its siblings are untouched.
    assert!(!crate::boxes::find(&out.boxes.pages[0], "a").hidden);
    assert!(!crate::boxes::find(&out.boxes.pages[0], "c").hidden);
}

#[test]
fn a_collapsed_item_reports_no_placement_at_all() {
    let out = run_full(&stack("", ", collapse: true"), json!({ "show": false }));
    let ids: Vec<_> = out.boxes.pages[0]
        .iter()
        .filter_map(|b| b.id.as_deref())
        .collect();
    // No position exists to report — the layer tree, not the canvas, is
    // how a Designer reaches it.
    assert_eq!(ids, vec!["a", "c"]);
    assert!(out.boxes.pages[0].iter().all(|b| !b.hidden));
}

#[test]
fn equals_selects_among_stacked_items_at_one_coordinate() {
    // The queue item's driving case: a switch/case of same-coordinate
    // images, each with its own `visible:`.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: rect
        id: approved
        style: { borderWidth: 1 }
        box: { x: 10, y: 10, w: 80, h: 80 }
        visible: { key: status, equals: approved }
      - type: rect
        id: rejected
        style: { borderWidth: 1 }
        box: { x: 10, y: 10, w: 80, h: 80 }
        visible: { key: status, equals: rejected }
"#;
    let out = run_full(yaml, json!({ "status": "approved" }));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert_eq!(rect_shapes(&out.document.pages[0]).len(), 1);
    assert!(!crate::boxes::find(&out.boxes.pages[0], "approved").hidden);
    assert!(crate::boxes::find(&out.boxes.pages[0], "rejected").hidden);
}

#[test]
fn an_array_value_is_multi_select() {
    // Inherited from the mark predicate: an array value HOLDS when it
    // contains the target, so one `visible:` covers a checkbox group.
    let shown = run_full(
        &stack("", ", equals: fax"),
        json!({ "show": ["mail", "fax"] }),
    );
    assert!(shown.diagnostics.is_empty(), "{:?}", shown.diagnostics);
    assert_eq!(rect_shapes(&shown.document.pages[0]).len(), 3);

    let out = run_full(
        &stack("", ", equals: sms"),
        json!({ "show": ["mail", "fax"] }),
    );
    assert!(out.diagnostics.is_empty(), "a plain non-match is silent");
    assert_eq!(rect_shapes(&out.document.pages[0]).len(), 2);
}
