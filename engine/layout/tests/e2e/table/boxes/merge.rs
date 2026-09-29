//! `mergeEmptyCells` in the box index — the geometry the Designer draws a
//! body cell's selection from: a value that extends right over empty cells
//! is ONE placement as wide as the columns it covers, the absorbed columns
//! place nothing in that row, and an empty cell with no value to its left
//! keeps its own column placement.

use super::page_boxes;
use crate::common::*;
use shojiku_layout::PlacedBox;

/// A four-column table (50pt each) with `mergeEmptyCells: true`.
fn merge_table(rows: Value) -> LayoutOutput {
    run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 600 }
    items:
      - type: table
        data: { key: rows }
        mergeEmptyCells: true
        columns:
          - { label: a, data: { key: a }, width: 50 }
          - { label: b, data: { key: b }, width: 50 }
          - { label: c, data: { key: c }, width: 50 }
          - { label: d, data: { key: d }, width: 50 }
"#,
        json!({ "rows": rows }),
    )
}

/// Every placement of `columns[col]` on page 0, as (x, w), in emission
/// order — the label cell first, then one per body row that places it.
fn column(out: &LayoutOutput, col: usize) -> Vec<(f64, f64)> {
    let suffix = format!(".columns[{col}]");
    page_boxes(out, 0)
        .iter()
        .filter(|b| b.path.ends_with(&suffix))
        .map(|b: &PlacedBox| (b.border.x, b.border.w))
        .collect()
}

#[test]
fn a_merged_cell_places_one_box_across_the_columns_it_covers() {
    let out = merge_table(json!([{ "a": "1", "b": "", "c": "", "d": "4" }]));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    // Column 0's body cell covers columns 0-2; columns 1 and 2 place only
    // their labels; column 3 is untouched.
    assert_eq!(column(&out, 0), vec![(0.0, 50.0), (0.0, 150.0)]);
    assert_eq!(column(&out, 1), vec![(50.0, 50.0)]);
    assert_eq!(column(&out, 2), vec![(100.0, 50.0)]);
    assert_eq!(column(&out, 3), vec![(150.0, 50.0), (150.0, 50.0)]);
}

#[test]
fn a_leading_empty_cell_keeps_its_own_placement() {
    let out = merge_table(json!([{ "a": "", "b": "2", "c": "", "d": "" }]));
    // Column 0 has no value to its left, so it stays a cell of its own;
    // column 1 extends over columns 2 and 3.
    assert_eq!(column(&out, 0), vec![(0.0, 50.0), (0.0, 50.0)]);
    assert_eq!(column(&out, 1), vec![(50.0, 50.0), (50.0, 150.0)]);
    assert_eq!(column(&out, 2), vec![(100.0, 50.0)]);
    assert_eq!(column(&out, 3), vec![(150.0, 50.0)]);
}

#[test]
fn an_all_empty_row_places_every_column() {
    let out = merge_table(json!([{ "a": "", "b": "", "c": "", "d": "" }]));
    // Nothing to extend: every column places its label and its body cell,
    // so a click on any of them selects that column, not the table.
    for col in 0..4 {
        let x = 50.0 * col as f64;
        assert_eq!(
            column(&out, col),
            vec![(x, 50.0), (x, 50.0)],
            "column {col}"
        );
    }
}
