//! The `repeat` item's own per-page box-index fragments: the item accepts
//! an `id:` but places only cells, so it emits one `PlacedBox` per page it
//! occupies (region top → the deepest slot on that page) at the item path.

use crate::common::*;
use shojiku_layout::PlacedBox;

/// A 2x2 n-up over `count` empty elements in a 400x400 flow region (no
/// gaps → 200pt square slots), with the given fill `direction`.
fn nup(count: usize, direction: &str) -> shojiku_layout::LayoutOutput {
    let elements: Vec<Value> = (0..count).map(|_| json!({})).collect();
    run_full(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: repeat
        id: cards
        data: {{ key: cells }}
        grid: {{ columns: 2, rows: 2, direction: {direction} }}
        cell:
          items:
            - type: text
              text: x
"#
        ),
        json!({ "cells": elements }),
    )
}

fn card_frags(out: &shojiku_layout::LayoutOutput, page: usize) -> Vec<&PlacedBox> {
    out.boxes.pages[page]
        .iter()
        .filter(|b| b.id.as_deref() == Some("cards"))
        .collect()
}

#[test]
fn row_direction_fragment_per_page_shrinks_on_a_partial_last_page() {
    // 6 elements, 4 per page: page 0 fills both rows (h 400), page 1 holds
    // 2 elements in row 0 only (h 200).
    let out = nup(6, "row");
    assert_eq!(out.document.pages.len(), 2);
    let (p0, p1) = (card_frags(&out, 0), card_frags(&out, 1));
    assert_eq!((p0.len(), p1.len()), (1, 1));
    // The fragment addresses the repeat item itself, at region x/width.
    assert_eq!(p0[0].path, "sections.body.items[0]");
    assert_eq!(
        (
            p0[0].border.x,
            p0[0].border.y,
            p0[0].border.w,
            p0[0].border.h
        ),
        (0.0, 0.0, 400.0, 400.0)
    );
    // Border == content (no box-model padding of its own).
    assert_eq!(p0[0].content, p0[0].border);
    // Partial last page: only the first row is occupied.
    assert_eq!((p1[0].border.y, p1[0].border.h), (0.0, 200.0));
}

#[test]
fn column_direction_fills_the_last_page_height() {
    // Same 6 elements, but column-major: the last page's 2 elements fill
    // column 0's two rows (h 400), where row-major left only row 0 (h 200).
    let out = nup(6, "column");
    assert_eq!(card_frags(&out, 1)[0].border.h, 400.0);
}

#[test]
fn empty_array_emits_no_fragment() {
    let out = nup(0, "row");
    assert!(!out
        .boxes
        .pages
        .iter()
        .flatten()
        .any(|b| b.id.as_deref() == Some("cards")));
}

#[test]
fn missing_data_emits_no_fragment() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        id: cards
        data: { key: ghost }
        cell:
          items:
            - type: text
              text: x
"#,
        json!({}),
    );
    assert!(out.diagnostics.iter().any(|d| d.code == "missing_data"));
    assert!(!out
        .boxes
        .pages
        .iter()
        .flatten()
        .any(|b| b.id.as_deref() == Some("cards")));
}

#[test]
fn page_cap_truncation_keeps_fragments_for_placed_pages_only() {
    // A 1x1 grid places one element per page. MAX_PAGES + 1 elements
    // exhaust the cap mid-array; the item must still emit a fragment for
    // every page that DID fill, and none beyond.
    let elements: Vec<Value> = (0..=MAX_PAGES).map(|_| json!({})).collect();
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 20 }
    items:
      - type: repeat
        id: cards
        data: { key: cells }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: text
              text: x
"#,
        json!({ "cells": elements }),
    );
    assert!(out.diagnostics.iter().any(|d| d.code == "page_overflow"));
    assert_eq!(out.document.pages.len(), MAX_PAGES);
    let frags = out
        .boxes
        .pages
        .iter()
        .flatten()
        .filter(|b| b.id.as_deref() == Some("cards"))
        .count();
    assert_eq!(frags, MAX_PAGES);
}
