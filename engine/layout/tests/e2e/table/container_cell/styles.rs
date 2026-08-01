//! Style layering into a container cell: the row layer (zebra
//! included) and the column layer are the cell's inherited context, and
//! the cell's own `style` layers on top — mirroring a text column's
//! cascade.

use super::cell_table;
use crate::common::*;

#[test]
fn the_cells_own_style_reaches_its_items() {
    let out = cell_table(
        "minHeight: 20",
        "              style: { fontSize: 24 }\n              items:\n                - { type: text, text: あ }",
        json!([{}]),
    );
    let block = text_blocks(&out.document.pages[0])[0];
    assert_eq!(block.font_size, 24.0);
}

#[test]
fn row_and_column_styles_cascade_into_the_cell() {
    // The ROW layer (zebra included) and the COLUMN layer are the cell's
    // inherited context, exactly as they are for a text column: the
    // first column inherits the row's fontSize, the second overrides it
    // with its own.
    let out = run_full(
        r##"
page: { margin: 0 }
defaults: { style: { fontFamily: biz-ud-gothic, fontSize: 10 } }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 700 }
    items:
      - type: table
        data: { key: rows }
        style: { borderWidth: 0 }
        row:
          minHeight: 20
          style: { fontSize: 18 }
        columns:
          - width: 100
            cell:
              items:
                - { type: text, text: あ }
          - width: 100
            style: { fontSize: 24 }
            cell:
              items:
                - { type: text, text: い }
"##,
        json!({ "rows": [{}] }),
    );
    let sizes: Vec<f64> = text_blocks(&out.document.pages[0])
        .iter()
        .map(|b| b.font_size)
        .collect();
    assert_eq!(sizes, vec![18.0, 24.0], "row layer then column override");
}
