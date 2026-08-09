//! `visible:` in the placement contexts that are not the flow body:
//! header/footer bands, flex rows and columns, and the static grid.
//!
//! One case per context on purpose. The verdict comes from one shared
//! helper, but each walk CONSUMES it differently — a row hands the freed
//! width to its survivors, a grid hands back a cell — so a walk that
//! ignored the verdict would fail nowhere else.

use crate::common::*;
use serde_json::json;

pub fn boxes_of(out: &shojiku_layout::LayoutOutput, id: &str) -> shojiku_layout::PlacedBox {
    crate::boxes::find(&out.boxes.pages[0], id).clone()
}

#[test]
fn a_hidden_band_item_draws_nothing_but_reports_its_box() {
    let yaml = r#"
page: { margin: 0 }
sections:
  header:
    height: 40
    items:
      - type: rect
        id: stamp
        style: { borderWidth: 1 }
        box: { x: 10, y: 5, w: 40, h: 20 }
        visible: { key: draft }
  body:
    type: flow
    items: []
"#;
    let shown = run_full(yaml, json!({ "draft": true }));
    assert_eq!(rect_shapes(&shown.document.pages[0]).len(), 1);

    let out = run_full(yaml, json!({ "draft": false }));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert!(rect_shapes(&out.document.pages[0]).is_empty());
    assert!(boxes_of(&out, "stamp").hidden);
}

#[test]
fn a_collapsed_band_item_reports_no_box() {
    let yaml = r#"
page: { margin: 0 }
sections:
  header:
    height: 40
    items:
      - type: rect
        id: stamp
        style: { borderWidth: 1 }
        box: { x: 10, y: 5, w: 40, h: 20 }
        visible: { key: draft, collapse: true }
  body:
    type: flow
    items: []
"#;
    let out = run_full(yaml, json!({ "draft": false }));
    assert!(rect_shapes(&out.document.pages[0]).is_empty());
    assert!(out.boxes.pages[0]
        .iter()
        .all(|b| b.id.as_deref() != Some("stamp")));
}

/// A flex parent whose FIRST child conditionally disappears; `direction`
/// and the binding extras vary per case.
fn flex(direction: &str, extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: container
        id: box
        box: {{ x: 0, y: 0, w: 300, h: 100, direction: {direction} }}
        items:
          - type: container
            id: one
            style: {{ borderWidth: 1 }}
            box: {{ h: 20 }}
            visible: {{ key: show{extra} }}
            items: []
          - type: container
            id: two
            style: {{ borderWidth: 1 }}
            box: {{ h: 20 }}
            items: []
"#
    )
}

#[test]
fn a_hidden_row_child_keeps_its_share_of_the_width() {
    let shown = run_full(&flex("row", ""), json!({ "show": true }));
    let baseline = boxes_of(&shown, "two").border.x;

    let out = run_full(&flex("row", ""), json!({ "show": false }));
    assert_eq!(
        boxes_of(&out, "two").border.x,
        baseline,
        "hidden reserves the slot, so the survivor does not move"
    );
    assert!(boxes_of(&out, "one").hidden);
}

#[test]
fn a_collapsed_row_child_gives_its_width_to_the_survivor() {
    let shown = run_full(&flex("row", ", collapse: true"), json!({ "show": true }));
    let shared = boxes_of(&shown, "two").border.w;

    let out = run_full(&flex("row", ", collapse: true"), json!({ "show": false }));
    let whole = boxes_of(&out, "two").border.w;
    // `plan_row` divides the width among the survivors only, so the
    // remaining child is wider than when it had a sibling.
    assert!(
        whole > shared,
        "collapsed child must leave the row plan: {whole} vs {shared}"
    );
    assert_eq!(whole, 300.0);
}

#[test]
fn a_collapsed_column_child_lets_its_siblings_move_up() {
    let shown = run_full(&flex("column", ", collapse: true"), json!({ "show": true }));
    assert_eq!(boxes_of(&shown, "two").border.y, 20.0);

    let out = run_full(
        &flex("column", ", collapse: true"),
        json!({ "show": false }),
    );
    assert_eq!(boxes_of(&out, "two").border.y, 0.0);
}

#[test]
fn a_collapsed_grid_child_leaves_no_phantom_cell() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 300, h: 200, type: grid, columns: 2 }
        items:
          - type: container
            id: one
            style: { borderWidth: 1 }
            box: { h: 20 }
            visible: { key: show, collapse: true }
            items: []
          - type: container
            id: two
            style: { borderWidth: 1 }
            box: { h: 20 }
            items: []
"#;
    let shown = run_full(yaml, json!({ "show": true }));
    // Two children, two columns: `two` sits in the second column.
    assert!(boxes_of(&shown, "two").border.x > 0.0);

    let out = run_full(yaml, json!({ "show": false }));
    // With the first child gone, `two` takes the FIRST cell — the count
    // that sizes the tracks dropped with it.
    assert_eq!(boxes_of(&out, "two").border.x, 0.0);
}
