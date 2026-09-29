//! `mergeEmptyCells` as a spreadsheet merge, over the transform itself: a
//! value extends right over the empty cells after it, and an empty cell
//! with no value to its left stays its own cell.

use std::rc::Rc;

use serde_json::{json, Value};
use shojiku_core::{ContainerItem, ImageFit};

use super::merge_empty;
use crate::engine::table::rows::{Cell, CellContent, CellPath};
use crate::engine::Scope;
use crate::style::ComputedStyle;

/// A body cell for column `col`, `width` wide, drawing `content`.
fn cell(col: usize, width: f64, content: CellContent<'static>) -> Cell<'static> {
    Cell {
        width,
        content,
        computed: ComputedStyle::default(),
        id: Some(format!("c{col}")),
        path: CellPath::Column(col),
    }
}

fn text(col: usize, width: f64, s: &str) -> Cell<'static> {
    cell(col, width, CellContent::Text(s.to_string()))
}

/// A row from its texts, column `n` being `10 * (n + 1)` wide so every
/// merged width names exactly which columns it covers.
fn row(texts: &[&str]) -> Vec<Cell<'static>> {
    texts
        .iter()
        .enumerate()
        .map(|(col, s)| text(col, 10.0 * (col as f64 + 1.0), s))
        .collect()
}

/// Each output cell as (its column, its width) — the column read back from
/// the `c<n>` id `cell` stamps, so a lost or swapped cell shows as a wrong
/// number. Every cell must still be addressed as a column: a body cell
/// never turns into a synthesized one.
fn shape(cells: &[Cell<'_>]) -> Vec<(usize, f64)> {
    assert!(cells.iter().all(|c| matches!(c.path, CellPath::Column(_))));
    cells
        .iter()
        .map(|c| {
            (
                c.id.as_ref().expect("a test cell")[1..]
                    .parse()
                    .expect("c<n>"),
                c.width,
            )
        })
        .collect()
}

/// Merges `cells`, checking the two invariants every case shares: the row
/// keeps its total width, and the cells stay in column order.
fn merged(cells: Vec<Cell<'static>>) -> Vec<(usize, f64)> {
    let total: f64 = cells.iter().map(|c| c.width).sum();
    let out = shape(&merge_empty(cells));
    assert_eq!(out.iter().map(|(_, w)| w).sum::<f64>(), total, "{out:?}");
    assert!(out.windows(2).all(|p| p[0].0 < p[1].0), "{out:?}");
    out
}

#[test]
fn a_value_extends_right_over_the_empty_cell_after_it() {
    // [A][ ][B] → [A    ][B]: A takes columns 0-1, B stays in column 2.
    assert_eq!(merged(row(&["A", "", "B"])), vec![(0, 30.0), (2, 30.0)]);
}

#[test]
fn trailing_empties_extend_the_last_value() {
    assert_eq!(merged(row(&["A", "B", "", ""])), vec![(0, 10.0), (1, 90.0)]);
}

#[test]
fn a_leading_empty_run_stays_as_its_own_cells() {
    // No value to their left, so nothing absorbs them — and they are not
    // pulled into the value on their right either.
    assert_eq!(
        merged(row(&["", "", "A"])),
        vec![(0, 10.0), (1, 20.0), (2, 30.0)]
    );
}

#[test]
fn an_all_empty_row_keeps_every_column_cell() {
    assert_eq!(
        merged(row(&["", "", ""])),
        vec![(0, 10.0), (1, 20.0), (2, 30.0)]
    );
}

#[test]
fn a_mixed_row_merges_each_value_over_its_own_empties() {
    // [ ][A][ ][B][ ] → [ ][A    ][B    ]
    assert_eq!(
        merged(row(&["", "A", "", "B", ""])),
        vec![(0, 10.0), (1, 50.0), (3, 90.0)]
    );
}

#[test]
fn a_qr_image_or_container_cell_absorbs_the_empty_text_after_it_and_is_never_absorbed() {
    // An empty `cell:` sub-template still counts as content: its emptiness
    // is a per-row data question the transform does not ask.
    let container: &'static ContainerItem = Box::leak(Box::new(
        serde_json::from_value(json!({})).expect("an empty container"),
    ));
    let scope = Scope {
        element: Rc::new(Value::Null),
        array_key: String::new(),
        catalog_key: String::new(),
        index: 0,
    };
    let cells = vec![
        text(0, 10.0, ""),
        cell(1, 20.0, CellContent::Qr(String::new())),
        text(2, 30.0, ""),
        cell(
            3,
            40.0,
            CellContent::Image {
                asset_id: String::new(),
                fit: ImageFit::default(),
            },
        ),
        text(4, 50.0, ""),
        cell(
            5,
            60.0,
            CellContent::Cell {
                item: container,
                scope,
            },
        ),
        text(6, 70.0, ""),
    ];
    // The empty text before the QR stays its own cell; the QR, the image
    // and the container each take the empty text after them, whatever
    // they draw, and none of them is absorbed by the cell before it.
    assert_eq!(
        merged(cells),
        vec![(0, 10.0), (1, 50.0), (3, 90.0), (5, 130.0)]
    );
}

#[test]
fn an_absorbing_cell_keeps_its_own_content_and_id() {
    let out = merge_empty(row(&["A", ""]));
    assert_eq!(out.len(), 1);
    assert!(matches!(&out[0].content, CellContent::Text(s) if s == "A"));
    assert_eq!(out[0].id.as_deref(), Some("c0"));
}
