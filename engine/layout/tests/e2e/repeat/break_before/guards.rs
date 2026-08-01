//! `breakBefore: auto` guards: a cursor too low to fit a row, the
//! box-index fragments of a short first page, and the hostile-input caps
//! the opt-in must not weaken.

use super::{cell_boxes, imposition};
use crate::common::*;
use shojiku_layout::{LayoutOutput, PlacedBox};

/// A 310pt title leaves 90pt — less than one 100pt row. Placing a
/// zero-row grid would never advance, so the grid breaks to a fresh page
/// exactly like the default (and says nothing: the author asked for
/// "start here IF it fits").
#[test]
fn a_cursor_too_low_for_one_row_falls_back_to_a_fresh_page() {
    let out = imposition(Some(310.0), Some("auto"), "row", 10);
    let default = imposition(Some(310.0), None, "row", 10);

    assert!(out.diagnostics.items.is_empty(), "{:?}", out.diagnostics);
    assert!(cell_boxes(&out, 0).is_empty());
    assert_eq!(cell_pos(&out.document.pages[1], "c0"), (0.0, 0.0));
    assert_eq!(
        serde_json::to_string(&out.document).unwrap(),
        serde_json::to_string(&default.document).unwrap()
    );
}

/// The `repeat` item's own fragment follows the grid, not the region: on
/// a page started at the cursor it spans cursor → deepest slot.
#[test]
fn the_items_fragment_starts_at_the_cursor_on_a_short_first_page() {
    let out = imposition(Some(12.0), Some("auto"), "row", 10);

    let frag = |page: usize| -> (f64, f64, f64, f64) {
        let b: Vec<&PlacedBox> = out.boxes.pages[page]
            .iter()
            .filter(|b| b.id.as_deref() == Some("sheet"))
            .collect();
        assert_eq!(b.len(), 1, "one fragment per page");
        (b[0].border.x, b[0].border.y, b[0].border.w, b[0].border.h)
    };
    // Page 1: three rows from the cursor (12 → 312).
    assert_eq!(frag(0), (0.0, 12.0, 400.0, 300.0));
    // Page 2: two rows from the region top (0 → 200).
    assert_eq!(frag(1), (0.0, 0.0, 400.0, 200.0));
}

/// A 1-column x 2-row grid under a title: `auto` fits one row at the
/// cursor, then two per page — enough elements to run past the page cap,
/// which must still truncate with one diagnostic and no panic.
fn capped(count: usize) -> LayoutOutput {
    let elements: Vec<Value> = (0..count)
        .map(|i| json!({ "label": format!("c{i}") }))
        .collect();
    run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        text: TITLE
        box: { w: 400, h: 12 }
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: repeat
        id: sheet
        data: { key: cells }
        breakBefore: auto
        grid: { columns: 1, rows: 2 }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({ "cells": elements }),
    )
}

#[test]
fn auto_still_truncates_at_the_page_cap() {
    let out = capped(1100);

    assert_eq!(out.document.pages.len(), MAX_PAGES);
    let overflows = out
        .diagnostics
        .iter()
        .filter(|d| d.code == "page_overflow")
        .count();
    assert_eq!(overflows, 1, "one page_overflow, not one per element");
    // The pages that DID fill still carry the item's fragments.
    assert!(out.boxes.pages[0]
        .iter()
        .any(|b| b.id.as_deref() == Some("sheet")));
}

/// The per-page cell cap clamps `auto` grids exactly like default ones —
/// the opt-in changes where a grid starts, never how big it may be.
#[test]
fn auto_grids_clamp_to_the_per_page_cell_cap() {
    let elements: Vec<Value> = (0..4)
        .map(|i| json!({ "label": format!("c{i}") }))
        .collect();
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        text: TITLE
        box: { w: 400, h: 12 }
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: repeat
        data: { key: cells }
        breakBefore: auto
        grid: { columns: 100, rows: 8 }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({ "cells": elements }),
    );

    let clamps = out
        .diagnostics
        .iter()
        .filter(|d| d.code == "imposition_grid_clamped")
        .count();
    assert_eq!(clamps, 1);
    assert!(!out.document.pages.is_empty());
}

/// An empty array places nothing, opt-in or not — and must not break a
/// page on the way to placing nothing.
#[test]
fn auto_over_an_empty_array_leaves_the_page_alone() {
    let out = imposition(Some(12.0), Some("auto"), "row", 0);

    assert_eq!(out.document.pages.len(), 1);
    assert!(cell_boxes(&out, 0).is_empty());
}
