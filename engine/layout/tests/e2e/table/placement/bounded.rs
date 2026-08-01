//! Bounded contexts: a table in a container, an absolute body, a
//! band, or a repeat cell renders as one non-paginating block.

use crate::common::*;

#[test]
fn table_in_container_stacks_rows_at_the_container_origin() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 40, y: 100, w: 200 }
        items:
          - type: table
            data: { key: rows }
            header: { height: 20 }
            row: { height: 20 }
            columns:
              - { label: N, data: { key: n }, width: 60 }
              - { label: V, data: { key: v } }
"#,
        json!({ "rows": [{"n":"a","v":"x"}, {"n":"b","v":"y"}] }),
    );
    assert!(!diags.has_errors(), "{diags:?}");
    let (ax, ay) = cell_pos(&doc.pages[0], "a");
    let (_, hy) = cell_pos(&doc.pages[0], "N");
    let (_, by) = cell_pos(&doc.pages[0], "b");
    // Header then two body rows, each 20pt tall, stacked from the top.
    assert!((ay - hy - 20.0).abs() < 1.0, "hy={hy} ay={ay}");
    assert!((by - ay - 20.0).abs() < 1.0, "ay={ay} by={by}");
    // Left column at the container x (40) plus the 4pt cell padding.
    assert!((ax - 44.0).abs() < 1.0, "ax={ax}");
}

#[test]
fn table_in_container_does_not_paginate() {
    let rows: Vec<Value> = (1..=40).map(|i| json!({ "n": format!("r{i}") })).collect();
    let (doc, _diags) = run(
        r#"
page: { size: { w: 200, h: 150 }, margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 150 }
    items:
      - type: container
        box: { w: 200 }
        items:
          - type: table
            data: { key: rows }
            row: { height: 10 }
            columns: [ { data: { key: n } } ]
"#,
        json!({ "rows": rows }),
    );
    // 40 rows x 10pt = 400pt, far taller than the 150pt page, but a
    // bounded table does NOT paginate: everything stays on page 1.
    assert_eq!(doc.pages.len(), 1);
    let text = all_text(&doc.pages[0]);
    assert!(text.contains("r1") && text.contains("r40"), "{text}");
}

#[test]
fn two_tables_side_by_side_in_a_row() {
    // The rirekisho A3 見開き shape: a row container with two tables.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 400, direction: row, gap: 20 }
        items:
          - type: table
            data: { key: left }
            row: { height: 16 }
            columns: [ { data: { key: t } } ]
          - type: table
            data: { key: right }
            row: { height: 16 }
            columns: [ { data: { key: t } } ]
"#,
        json!({ "left": [{"t":"LEFT"}], "right": [{"t":"RIGHT"}] }),
    );
    assert!(!diags.has_errors(), "{diags:?}");
    let (lx, _) = cell_pos(&doc.pages[0], "LEFT");
    let (rx, _) = cell_pos(&doc.pages[0], "RIGHT");
    // Row split: (400 - 20 gap) / 2 = 190 each; right starts at 210.
    assert!((lx - 4.0).abs() < 1.0, "lx={lx}");
    assert!((rx - 214.0).abs() < 1.0, "rx={rx}");
}

#[test]
fn positioned_table_in_a_container_honors_box_y() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 300, h: 400 }
        items:
          - type: table
            box: { x: 10, y: 50 }
            data: { key: rows }
            row: { height: 20 }
            columns: [ { data: { key: t }, width: 100 } ]
"#,
        json!({ "rows": [{"t":"HELLO"}] }),
    );
    assert!(!diags.has_errors(), "{diags:?}");
    let (x, y) = cell_pos(&doc.pages[0], "HELLO");
    assert!((x - 14.0).abs() < 1.0, "x={x}");
    assert!((50.0..70.0).contains(&y), "y={y}");
}

#[test]
fn table_in_a_band_renders() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: table
        box: { x: 5, y: 8 }
        data: { key: rows }
        row: { height: 20 }
        columns: [ { data: { key: t }, width: 120 } ]
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 400 }
    items:
      - type: text
        text: body
"#,
        json!({ "rows": [{"t":"BAND"}] }),
    );
    assert!(!diags.has_errors(), "{diags:?}");
    let (x, _) = cell_pos(&doc.pages[0], "BAND");
    assert!((x - 9.0).abs() < 1.0, "x={x}");
}

#[test]
fn table_in_absolute_body_renders_at_box_y() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: table
        box: { x: 20, y: 60 }
        data: { key: rows }
        row: { height: 20 }
        columns: [ { data: { key: t }, width: 120 } ]
"#,
        json!({ "rows": [{"t":"ABS"}] }),
    );
    assert!(!diags.has_errors(), "{diags:?}");
    let (x, y) = cell_pos(&doc.pages[0], "ABS");
    assert!((x - 24.0).abs() < 1.0, "x={x}");
    assert!((60.0..80.0).contains(&y), "y={y}");
}

#[test]
fn table_in_a_repeat_cell_warns_and_skips() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cards }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: table
              data: { key: rows }
              columns: [ { data: { key: t } } ]
"#,
        json!({ "cards": [{}], "rows": [{"t":"x"}] }),
    );
    assert!(diags.iter().any(|d| d.code == "table_in_cell"), "{diags:?}");
    assert!(text_blocks(&doc.pages[0]).is_empty());
}

#[test]
fn bounded_table_empty_collapse_renders_nothing() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200 }
        items:
          - type: table
            emptyBehavior: collapse
            data: { key: rows }
            columns: [ { data: { key: t } } ]
"#,
        json!({ "rows": [] }),
    );
    assert!(!diags.has_errors(), "{diags:?}");
    assert!(text_blocks(&doc.pages[0]).is_empty());
    assert!(rect_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn bounded_table_reserves_box_h_frames_and_places_its_id() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 300 }
        items:
          - type: table
            id: grid
            box: { w: 200, h: 120, margin: { top: 10 } }
            style: { borderWidth: { top: 2, right: 2, bottom: 2, left: 2 } }
            data: { key: rows }
            row: { height: 16 }
            columns: [ { data: { key: t } } ]
"#,
        json!({ "rows": [{"t":"x"}, {"t":"y"}] }),
    );
    let b = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("grid"))
        .expect("grid box");
    // Definite box.h reserves 120pt; box.w is 200pt.
    assert!((b.border.w - 200.0).abs() < 1e-6, "w={}", b.border.w);
    assert!((b.border.h - 120.0).abs() < 1e-6, "h={}", b.border.h);
    // The per-side outer frame (map form) emits filled border rects.
    let rects = rect_shapes(&out.document.pages[0]);
    assert!(
        rects.iter().any(|r| r.fill.is_some()),
        "expected frame rects"
    );
}
