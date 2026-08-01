//! Tables end to end (mirrors src `engine/table.rs`): data handling,
//! pagination, keep-together, and table diagnostics. Geometry lives in
//! `table/geom.rs`, cell/row building in `table/rows.rs`, `cell:`
//! columns in `table/container_cell/`, styling in `table/style.rs`,
//! per-row conditional styles in `table/conditional/`, and the box-index
//! sidecar in `table/boxes.rs`.

mod boxes;
mod cells;
mod conditional;
mod container_cell;
mod frame;
mod geom;
mod placement;
mod rows;
mod span;
mod style;
mod vertical;

use crate::common::*;

#[test]
fn table_paginates_and_repeats_header() {
    let rows: Vec<Value> = (1..=40)
        .map(|i| json!({"name": format!("item {i}"), "qty": i}))
        .collect();
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 300 }
    items:
      - type: table
        data: { key: items }
        row: { minHeight: 24 }
        columns:
          - label: 商品名
            data: { key: name }
            width: 300
          - label: 数量
            data: { key: qty }
            width: 100
            style: { textAlign: right }
"#,
        json!({ "items": rows }),
    );
    assert!(doc.pages.len() > 1, "expected pagination");
    // Header labels repeat on the second page.
    assert!(all_text(&doc.pages[0]).contains("商品名"));
    assert!(all_text(&doc.pages[1]).contains("商品名"));
    // All 40 rows made it somewhere.
    let joined: String = doc.pages.iter().map(all_text).collect();
    assert!(joined.contains("item 1"));
    assert!(joined.contains("item 40"));
}

#[test]
fn empty_table_collapses_or_reserves() {
    let collapse = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        emptyBehavior: collapse
        columns:
          - label: 名前
            data: { key: name }
            width: 100
"#;
    let (doc, _diags) = run(collapse, json!({"items": []}));
    assert!(doc.pages[0].items.is_empty());

    let reserve = collapse.replace("collapse", "reserve");
    let (doc, _diags) = run(&reserve, json!({"items": []}));
    assert!(all_text(&doc.pages[0]).contains("名前"));
}

#[test]
fn table_with_missing_params_warns() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: ghost }
        columns:
          - label: 名前
            data: { key: name }
            width: 100
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "missing_data"));
    // Missing data behaves like an empty array: collapse hides it.
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn table_with_non_array_params_errors_and_skips() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        columns:
          - data: { key: n }
            width: 50
"#,
        json!({ "items": "oops" }),
    );
    assert!(diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "not_an_array"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn row_overflow_without_auto_page_break_errors() {
    let rows: Vec<Value> = (1..=50).map(|i| json!({"n": i})).collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 100 }
    items:
      - type: table
        data: { key: items }
        autoPageBreak: false
        columns:
          - data: { key: n }
            width: 100
"#,
        json!({ "items": rows }),
    );
    assert!(diags.iter().any(|d| d.code == "row_overflow"));
    assert_eq!(doc.pages.len(), 1);
}

#[test]
fn repeat_header_false_omits_header_on_later_pages() {
    let rows: Vec<Value> = (1..=40).map(|i| json!({"n": i})).collect();
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: table
        data: { key: items }
        repeatHeader: false
        columns:
          - label: 番号
            data: { key: n }
            width: 100
"#,
        json!({ "items": rows }),
    );
    assert!(doc.pages.len() > 1);
    assert!(all_text(&doc.pages[0]).contains("番号"));
    assert!(!all_text(&doc.pages[1]).contains("番号"));
}

/// Body: a 200pt rect, then a keep-together table of `rows` 24pt rows in
/// a 300pt region.
fn keep_yaml(rect_h: f64) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 300 }}
    items:
      - type: rect
        style: {{ borderWidth: 1 }}
        box: {{ w: 10, h: {rect_h} }}
      - type: table
        data: {{ key: items }}
        keepTogether: true
        columns:
          - data: {{ key: n }}
            width: 100
"#
    )
}

fn n_rows(n: usize) -> Value {
    json!({ "items": (1..=n).map(|i| json!({"n": i})).collect::<Vec<_>>() })
}

#[test]
fn keep_together_breaks_to_a_fresh_page_when_it_would_split() {
    // 200pt used, 5 x 24 = 120pt table: splits if placed, fits page 2.
    let (doc, diags) = run(&keep_yaml(200.0), n_rows(5));
    assert!(!diags.has_errors());
    assert_eq!(doc.pages.len(), 2);
    // Page 1 keeps only the rect; every row starts at the page-2 top.
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1);
    let rows = rect_shapes(&doc.pages[1]);
    assert_eq!(rows.len(), 5);
    assert_eq!(rows[0].y, 0.0);
}

#[test]
fn keep_together_stays_in_place_when_it_fits() {
    // 100pt used, 120pt table fits the remaining 200pt: no break.
    let (doc, _diags) = run(&keep_yaml(100.0), n_rows(5));
    assert_eq!(doc.pages.len(), 1);
    let first_row_y = rect_shapes(&doc.pages[0])
        .iter()
        .filter(|r| r.h == 24.0)
        .map(|r| r.y)
        .fold(f64::INFINITY, f64::min);
    assert_eq!(first_row_y, 100.0);
}

#[test]
fn keep_together_taller_than_a_page_paginates_normally() {
    // 20 x 24 = 480pt > the 300pt region: a break could not keep it
    // together, so rows start in the remaining space as usual.
    let (doc, diags) = run(&keep_yaml(200.0), n_rows(20));
    assert!(!diags.has_errors());
    // 4 rows after the rect, 12 on page 2, 4 on page 3.
    assert_eq!(doc.pages.len(), 3);
    assert!(rect_shapes(&doc.pages[0]).iter().any(|r| r.y == 200.0));
}

#[test]
fn keep_together_respects_the_page_cap() {
    // One 24pt row per 30pt page: 501+ rows hit MAX_PAGES; the layouter
    // truncates with an error and terminates.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 30 }
    items:
      - type: table
        id: big
        data: { key: items }
        keepTogether: true
        columns:
          - data: { key: n }
            width: 100
"#;
    let (doc, diags) = run(yaml, n_rows(MAX_PAGES + 10));
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
    assert_eq!(doc.pages.len(), MAX_PAGES);
}
