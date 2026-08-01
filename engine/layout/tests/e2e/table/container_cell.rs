//! `cell:` columns end to end (mirrors src `engine/table/rows/cell.rs`):
//! a table cell hosting freely placed items. Row sizing lives in
//! `height`, what a cell draws and binds in `content`, style layering in
//! `styles`, and the box-index surface in `boxes`.

mod boxes;
mod content;
mod height;
mod styles;

use crate::common::*;

/// A one-column table whose column is a `cell:` sub-template, over
/// `rows` params. `cell_body` is the YAML under `cell:` (indented to sit
/// at the column's `cell:` level).
pub(super) fn cell_table(row_spec: &str, cell_body: &str, rows: Value) -> LayoutOutput {
    let yaml = format!(
        r#"
page: {{ margin: 0 }}
defaults: {{ style: {{ fontFamily: biz-ud-gothic, fontSize: 10 }} }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 700 }}
    items:
      - type: table
        data: {{ key: rows }}
        style: {{ borderWidth: 0 }}
        row: {{ {row_spec} }}
        columns:
          - width: 200
            cell:
{cell_body}
"#
    );
    run_full(&yaml, json!({ "rows": rows }))
}

/// Every diagnostic code the run emitted, in order.
pub(super) fn codes(out: &LayoutOutput) -> Vec<String> {
    out.diagnostics
        .items
        .iter()
        .map(|d| d.code.as_str().to_string())
        .collect()
}

/// The placed box at exactly `path` on page 0 (one per row, so `nth`
/// picks the row).
pub(super) fn box_at<'a>(out: &'a LayoutOutput, path: &str, nth: usize) -> &'a PlacedBox {
    let hits: Vec<_> = out.boxes.pages[0]
        .iter()
        .filter(|b| b.path == path)
        .collect();
    assert!(
        hits.len() > nth,
        "no box #{nth} at `{path}`; found {} ({:?})",
        hits.len(),
        out.boxes.pages[0]
            .iter()
            .map(|b| b.path.as_str())
            .collect::<Vec<_>>()
    );
    hits[nth]
}

pub(super) use shojiku_layout::PlacedBox;
