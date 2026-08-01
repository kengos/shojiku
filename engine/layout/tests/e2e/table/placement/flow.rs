//! Flow honoring: `box` narrows/centers a table horizontally in the
//! flow body while pagination continues (`box.y` stays flow-owned).

use crate::common::*;

#[test]
fn flow_table_box_centers_with_auto_margins() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: table
        id: t
        box: { w: 200, margin: { left: auto, right: auto } }
        data: { key: rows }
        columns: [ { data: { key: n }, width: 200 } ]
"#,
        json!({ "rows": [{"n":"x"}] }),
    );
    // A 200-wide table centered in a 400-wide flow region: x offset 100.
    let b = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("t"))
        .expect("t box");
    assert!((b.border.x - 100.0).abs() < 1.0, "x={}", b.border.x);
}

#[test]
fn flow_table_box_offsets_by_box_x() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: table
        id: t
        box: { x: 50, w: 150 }
        data: { key: rows }
        columns: [ { data: { key: n }, width: 150 } ]
"#,
        json!({ "rows": [{"n":"x"}] }),
    );
    let b = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("t"))
        .expect("t box");
    assert!((b.border.x - 50.0).abs() < 1.0, "x={}", b.border.x);
}
