//! Table entries in the id-addressable box index (the GUI's table
//! surface): per-page table fragments and per-cell column placements.
//! `groups` covers the `headerGroups` row's own placements.

mod groups;

use crate::common::*;
use shojiku_layout::PlacedBox;

fn page_boxes(out: &LayoutOutput, page: usize) -> &[PlacedBox] {
    &out.boxes.pages[page]
}

#[test]
fn paginating_table_yields_one_fragment_per_page() {
    // 100pt region, 24pt header + 24pt rows: 3 rows fit with the header
    // on each page; 5 rows span two pages.
    let rows: Vec<Value> = (1..=5).map(|i| json!({"n": i})).collect();
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 10, y: 0, w: 400, h: 100 }
    items:
      - type: table
        id: lines
        data: { key: items }
        columns:
          - label: 番号
            data: { key: n }
            width: 100
"#,
        json!({ "items": rows }),
    );
    assert_eq!(out.document.pages.len(), 2);
    let first: Vec<_> = page_boxes(&out, 0)
        .iter()
        .filter(|b| b.id.as_deref() == Some("lines"))
        .collect();
    let second: Vec<_> = page_boxes(&out, 1)
        .iter()
        .filter(|b| b.id.as_deref() == Some("lines"))
        .collect();
    assert_eq!((first.len(), second.len()), (1, 1));
    // Page 1: header + 3 rows = 96pt from the region top, at the flow x.
    assert_eq!(
        (
            first[0].border.x,
            first[0].border.y,
            first[0].border.w,
            first[0].border.h
        ),
        (10.0, 0.0, 100.0, 96.0)
    );
    // Page 2: repeated header + 2 rows = 72pt.
    assert_eq!((second[0].border.y, second[0].border.h), (0.0, 72.0));
}

#[test]
fn truncated_layout_records_no_fragments_for_a_late_table() {
    // The first table exhausts the 500-page cap; the second (id-carrying)
    // table places nothing, so it must record no fragments either. Its
    // fixed zero-height row also proves degenerate rows terminate: the
    // row loop is bounded by the params array, never by "while it fits".
    let filler: Vec<Value> = (0..=MAX_PAGES).map(|i| json!({"n": i})).collect();
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 30 }
    items:
      - type: table
        data: { key: filler }
        columns:
          - data: { key: n }
            width: 100
      - type: table
        id: late
        data: { key: tiny }
        row: { height: 0 }
        columns:
          - data: { key: n }
            width: 100
"#,
        json!({ "filler": filler, "tiny": [ {"n": ""} ] }),
    );
    assert!(out.diagnostics.iter().any(|d| d.code == "page_overflow"));
    assert_eq!(out.document.pages.len(), MAX_PAGES);
    assert!(!out
        .boxes
        .pages
        .iter()
        .flatten()
        .any(|b| b.id.as_deref() == Some("late")));
}

#[test]
fn column_id_yields_a_box_per_cell_including_the_header() {
    let out = run_full(
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
          - label: 名前
            data: { key: name }
            width: 100
          - id: qty
            label: 数量
            data: { key: n }
            width: 80
"#,
        json!({ "items": [ {"name": "a", "n": 1}, {"name": "b", "n": 2} ] }),
    );
    let cells: Vec<_> = page_boxes(&out, 0)
        .iter()
        .filter(|b| b.id.as_deref() == Some("qty"))
        .collect();
    // Header cell + one per body row.
    assert_eq!(cells.len(), 3);
    // The id'd column is index 1; its cells carry the `columns[1]` path.
    assert!(cells.iter().all(|b| b.path.ends_with(".columns[1]")));
    // The column starts after the 100pt first column; rows stack by 24pt.
    for (i, cell) in cells.iter().enumerate() {
        assert_eq!(cell.border.x, 100.0);
        assert_eq!(cell.border.w, 80.0);
        assert_eq!(cell.border.y, i as f64 * 24.0);
        // Content box is inset by the 4pt cell padding.
        assert_eq!(cell.content.x, 104.0);
        assert_eq!(cell.content.h, 16.0);
    }
    // The id-less first column now also emits a box per cell,
    // addressed by path alone (`…columns[0]`, no id).
    let name_cells: Vec<_> = page_boxes(&out, 0)
        .iter()
        .filter(|b| b.path.ends_with(".columns[0]"))
        .collect();
    assert_eq!(name_cells.len(), 3);
    assert!(name_cells.iter().all(|b| b.id.is_none()));
}
