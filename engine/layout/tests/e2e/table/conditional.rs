//! Per-row conditional styles end to end (mirrors src
//! `engine/table/style/conditional.rs`): which rows a `when` predicate
//! selects and how its layers stack (`apply`), the same across the
//! placement contexts a table renders in (`contexts`), and the warning /
//! hostile-input / blank-form behavior (`guards`).

mod apply;
mod contexts;
mod guards;

use crate::common::*;

/// A one-column table (200pt wide, no cell padding, so a left-aligned
/// cell starts at exactly x=0) whose `row:` sub-keys the caller supplies.
/// An empty `row_extra` omits the `row:` key entirely (an empty map would
/// parse as a null `RowSpec`), which is what the "no conditional entries
/// at all" baseline needs.
pub(crate) fn conditional_table(row_extra: &str, rows: Value) -> (LayoutDocument, Diagnostics) {
    let row_block = if row_extra.is_empty() {
        String::new()
    } else {
        format!("        row:\n{row_extra}")
    };
    run(
        &format!(
            r##"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
      - type: table
        data: {{ key: items }}
        cellPadding: 0
{row_block}        columns:
          - data: {{ key: label }}
            width: 200
"##
        ),
        json!({ "items": rows }),
    )
}

/// The `(x, width)` of the first line of the block whose text is `text` —
/// enough to place it exactly within the 200pt column.
pub(crate) fn line_geom(page: &LayoutPage, text: &str) -> (f64, f64) {
    let block = text_blocks(page)
        .into_iter()
        .find(|b| b.lines[0].text == text)
        .unwrap_or_else(|| panic!("no cell with text `{text}`"));
    (block.lines[0].x, block.lines[0].width)
}

/// Asserts the cell text is centered in the 200pt column.
pub(crate) fn assert_centered(page: &LayoutPage, text: &str) {
    let (x, w) = line_geom(page, text);
    assert!(
        (x + w / 2.0 - 100.0).abs() < 0.5,
        "`{text}` should be centered in the 200pt column; x={x} w={w}"
    );
}

/// Asserts the cell text sits at the column's left edge (the default).
pub(crate) fn assert_left_aligned(page: &LayoutPage, text: &str) {
    let (x, _) = line_geom(page, text);
    assert_eq!(x, 0.0, "`{text}` should keep the default left alignment");
}

/// The row-band fills, in row order.
pub(crate) fn row_fills(page: &LayoutPage) -> Vec<(f32, f32, f32)> {
    rect_shapes(page)
        .into_iter()
        .filter_map(|r| r.fill)
        .collect()
}
