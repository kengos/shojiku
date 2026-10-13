//! `visible:` over an ANCHORED item (a `line` with an `item:` endpoint, an
//! `ellipse` with `anchor:`) inside a flex or grid container.
//!
//! An anchored item never rides the atom its walk hands back: it is deferred
//! to page assembly, so blanking that atom cannot hide it. Each case below
//! hides it through a different door — the item's own binding as a flex or
//! grid child (in flow and as an absolutely placed child), and a hidden
//! container ancestor — and asserts the same two things: nothing paints, and
//! the placement is still reported, stamped `hidden`, like every other
//! hidden item's.

use super::contexts::boxes_of;
use crate::common::*;
use serde_json::json;

/// An absolute body with a 40x20 `target` rect at (10, 10) and one
/// container at y 100 whose `box` is `container_box` and whose children
/// are `children` (indented YAML list lines).
fn holder(container_box: &str, children: &str) -> String {
    format!(
        "page: {{ size: {{ w: 300, h: 300 }}, margin: 0 }}\n\
         sections:\n  body:\n    type: absolute\n    items:\n      \
         - {{ type: rect, id: target, box: {{ x: 10, y: 10, w: 40, h: 20 }}, \
         style: {{ borderWidth: 1 }} }}\n      \
         - type: container\n        box: {container_box}\n        items:\n{children}"
    )
}

const LINE: &str = "          - { type: line, id: leader, visible: { key: show }, \
                    from: { x: 0, y: 0 }, to: { item: target } }\n";
const OVAL: &str =
    "          - { type: ellipse, id: ring, visible: { key: show }, anchor: target }\n";
const ROW: &str = "{ x: 0, y: 100, w: 300, h: 60, direction: row }";
const COLUMN: &str = "{ x: 0, y: 100, w: 300, h: 60 }";
const GRID: &str = "{ x: 0, y: 100, w: 300, type: grid, columns: 2 }";

/// Lays `yaml` out with `show` false and true; asserts the hidden run paints
/// no stroke or oval and reports `id` stamped hidden, and that the shown run
/// DOES paint — so a case cannot pass by never drawing at all.
fn assert_hidden_then_shown(yaml: &str, id: &str) {
    let marks = |page: &LayoutPage| line_shapes(page).len() + path_shapes(page).len();
    let hidden = run_full(yaml, json!({ "show": false }));
    assert!(hidden.diagnostics.is_empty(), "{:?}", hidden.diagnostics);
    assert_eq!(marks(&hidden.document.pages[0]), 0, "{id} must not paint");
    assert!(boxes_of(&hidden, id).hidden, "{id} must be stamped hidden");

    let shown = run_full(yaml, json!({ "show": true }));
    assert_eq!(
        marks(&shown.document.pages[0]),
        1,
        "{id} must paint when shown"
    );
    assert!(!boxes_of(&shown, id).hidden);
}

#[test]
fn a_hidden_anchored_line_in_a_flex_row_paints_nothing() {
    // A line is never a flex item, so this is the row's ABSOLUTE-child arm.
    assert_hidden_then_shown(&holder(ROW, LINE), "leader");
}

#[test]
fn a_hidden_anchored_line_in_a_flex_column_paints_nothing() {
    assert_hidden_then_shown(&holder(COLUMN, LINE), "leader");
}

#[test]
fn a_hidden_anchored_ellipse_as_a_flex_item_paints_nothing() {
    // An unpositioned ellipse IS a flex item: the row's in-flow arm.
    assert_hidden_then_shown(&holder(ROW, OVAL), "ring");
}

#[test]
fn a_hidden_anchored_ellipse_as_a_grid_cell_paints_nothing() {
    assert_hidden_then_shown(&holder(GRID, OVAL), "ring");
}

#[test]
fn a_hidden_anchored_line_in_a_grid_paints_nothing() {
    // The grid's absolute-child arm.
    assert_hidden_then_shown(&holder(GRID, LINE), "leader");
}

#[test]
fn a_hidden_container_hides_the_anchored_items_it_holds() {
    // The binding sits on a NESTED container inside a flex row: the anchored
    // descendants have no binding of their own and must be hidden by the
    // ancestor, as `visible.md` promises for the whole subtree.
    let children = "          - type: container\n            id: group\n            \
                    visible: { key: show }\n            box: { w: 100, h: 40 }\n            \
                    items:\n              \
                    - { type: line, id: leader, from: { x: 0, y: 0 }, to: { item: target } }\n";
    let yaml = holder(ROW, children);
    let marks = |page: &LayoutPage| line_shapes(page).len();
    let hidden = run_full(&yaml, json!({ "show": false }));
    assert_eq!(
        marks(&hidden.document.pages[0]),
        0,
        "the leader must not paint"
    );
    assert!(boxes_of(&hidden, "group").hidden);
    assert!(boxes_of(&hidden, "leader").hidden, "the descendant too");
    let shown = run_full(&yaml, json!({ "show": true }));
    assert_eq!(marks(&shown.document.pages[0]), 1);
}

#[test]
fn a_hidden_sibling_does_not_hide_a_later_anchored_item() {
    // The stamp covers what was deferred WHILE the hidden child was laid
    // out, and nothing after it: a shown leader that follows a hidden one in
    // the same row still paints.
    let children = format!(
        "{LINE}          - {{ type: line, id: shown, from: {{ x: 0, y: 0 }}, \
         to: {{ item: target, edge: left }} }}\n"
    );
    let out = run_full(&holder(ROW, &children), json!({ "show": false }));
    assert_eq!(line_shapes(&out.document.pages[0]).len(), 1);
    assert!(boxes_of(&out, "leader").hidden);
    assert!(!boxes_of(&out, "shown").hidden);
}
