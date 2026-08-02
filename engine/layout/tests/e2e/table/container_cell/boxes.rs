//! The box-index surface of a container cell: the cell and everything
//! inside it are addressable per row, and cells survive pagination.

use super::{box_at, cell_table};
use crate::common::*;

#[test]
fn the_cell_and_its_children_are_addressable_per_row() {
    let out = cell_table(
        "minHeight: 20",
        "              items:\n                - { type: rect, box: { w: 10, h: 10 } }\n                - { type: rect, box: { w: 10, h: 10 } }",
        json!([{}, {}]),
    );
    let paths: Vec<&str> = out.boxes.pages[0].iter().map(|b| b.path.as_str()).collect();
    // One `columns[0]` + one `columns[0].cell` + two children, per row.
    let base = "sections.body.items[0].columns[0]";
    assert_eq!(paths.iter().filter(|p| **p == base).count(), 2);
    assert_eq!(
        paths
            .iter()
            .filter(|p| **p == format!("{base}.cell"))
            .count(),
        2
    );
    assert_eq!(
        paths
            .iter()
            .filter(|p| **p == format!("{base}.cell.items[1]"))
            .count(),
        2
    );
}

#[test]
fn an_authored_id_aliases_the_cells_path() {
    let out = cell_table(
        "minHeight: 20",
        "              id: note_cell\n              items:\n                - { type: rect, id: swatch, box: { w: 10, h: 10 } }",
        json!([{}]),
    );
    let cell = box_at(&out, "sections.body.items[0].columns[0].cell", 0);
    assert_eq!(cell.id.as_deref(), Some("note_cell"));
    let swatch = box_at(&out, "sections.body.items[0].columns[0].cell.items[0]", 0);
    assert_eq!(swatch.id.as_deref(), Some("swatch"));
}

#[test]
fn a_child_sits_below_its_rows_top_edge() {
    // Row 1's cell child carries the second row's absolute y, not the
    // first's — the row band's origin travels with the row.
    let out = cell_table(
        "height: 30",
        "              items:\n                - { type: rect, box: { w: 10, h: 10 } }",
        json!([{}, {}]),
    );
    let path = "sections.body.items[0].columns[0].cell.items[0]";
    assert_eq!(box_at(&out, path, 0).border.y, 0.0);
    assert_eq!(box_at(&out, path, 1).border.y, 30.0);
}

#[test]
fn container_cells_paginate_with_their_rows() {
    let rows: Vec<Value> = (1..=8).map(|i| json!({ "n": i })).collect();
    let out = run_full(
        r#"
page: { margin: 0 }
defaults: { style: { fontFamily: biz-ud-gothic, fontSize: 10 } }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 100 }
    items:
      - type: table
        data: { key: rows }
        style: { borderWidth: 0 }
        row: { height: 40 }
        columns:
          - label: 番号
            width: 100
            cell:
              items:
                - { type: text, data: { key: n } }
"#,
        json!({ "rows": rows }),
    );
    assert!(out.document.pages.len() > 1, "8 rows of 40pt need pages");
    // Every page carries the repeated header label plus its own cells.
    for page in &out.document.pages {
        let texts: Vec<String> = text_blocks(page)
            .iter()
            .flat_map(|b| line_texts(b))
            .collect();
        assert!(texts.contains(&"番号".to_string()), "header repeats");
    }
    let all: Vec<String> = out
        .document
        .pages
        .iter()
        .flat_map(|p| text_blocks(p).into_iter().flat_map(line_texts))
        .collect();
    assert!(all.contains(&"1".to_string()) && all.contains(&"8".to_string()));
}
