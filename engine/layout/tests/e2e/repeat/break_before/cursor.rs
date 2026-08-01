//! `breakBefore: auto` — the grid starts at the flow cursor: the first
//! page trades rows (never cell size) for the space already used, and
//! every later page is a full grid at the region top.

use super::{cell_boxes, imposition, placed_labels};
use crate::common::*;

/// A 12pt title leaves 388pt under the cursor: three 100pt rows fit, so
/// the first page holds 2 x 3 = 6 cells starting at y 12.
#[test]
fn auto_starts_the_grid_under_the_title_instead_of_a_fresh_page() {
    let out = imposition(Some(12.0), Some("auto"), "row", 10);

    assert!(out.diagnostics.items.is_empty(), "{:?}", out.diagnostics);
    assert_eq!(out.document.pages.len(), 2);
    // Page 1: the grid begins at the cursor, not the region top.
    assert_eq!(cell_pos(&out.document.pages[0], "c0"), (0.0, 12.0));
    assert_eq!(cell_pos(&out.document.pages[0], "c1"), (200.0, 12.0));
    assert_eq!(cell_pos(&out.document.pages[0], "c2"), (0.0, 112.0));
    assert_eq!(cell_pos(&out.document.pages[0], "c5"), (200.0, 212.0));
    assert_eq!(cell_boxes(&out, 0).len(), 6);
    // Page 2 owns the region outright: a full 2 x 4 grid at the top.
    assert_eq!(cell_pos(&out.document.pages[1], "c6"), (0.0, 0.0));
    assert_eq!(cell_pos(&out.document.pages[1], "c9"), (200.0, 100.0));
    assert_eq!(cell_boxes(&out, 1).len(), 4);
}

/// The whole point of deriving slots from the full region: a cut sheet's
/// cells must be identical everywhere, so only the row COUNT shrinks.
#[test]
fn auto_keeps_every_cell_the_same_size_across_pages() {
    let out = imposition(Some(12.0), Some("auto"), "row", 10);

    let sizes: Vec<(f64, f64)> = [0, 1]
        .iter()
        .flat_map(|p| cell_boxes(&out, *p))
        .map(|b| (b.border.w, b.border.h))
        .collect();
    assert_eq!(sizes.len(), 10);
    assert!(sizes.iter().all(|s| *s == (200.0, 100.0)), "{sizes:?}");
}

/// The default is unchanged: the grid refuses to share the title's page,
/// which is exactly the wasted page `auto` exists to reclaim (3 pages
/// here against `auto`'s 2).
#[test]
fn the_default_still_breaks_to_a_fresh_page_under_a_title() {
    let out = imposition(Some(12.0), None, "row", 10);

    assert_eq!(out.document.pages.len(), 3);
    assert!(cell_boxes(&out, 0).is_empty());
    assert_eq!(cell_pos(&out.document.pages[1], "c0"), (0.0, 0.0));
    assert_eq!(cell_boxes(&out, 1).len(), 8);
    assert_eq!(cell_boxes(&out, 2).len(), 2);
}

/// An explicit `breakBefore: page` is the default spelled out.
#[test]
fn an_explicit_page_break_matches_the_unset_default() {
    let explicit = imposition(Some(12.0), Some("page"), "row", 10);
    let unset = imposition(Some(12.0), None, "row", 10);

    assert_eq!(
        serde_json::to_string(&explicit.document).unwrap(),
        serde_json::to_string(&unset.document).unwrap()
    );
}

/// With nothing above it, `auto` has no cursor to start at — the grid is
/// already at the region top, so it must lay out exactly like the default.
#[test]
fn auto_on_an_untouched_page_lays_out_like_the_default() {
    let auto = imposition(None, Some("auto"), "row", 10);
    let default = imposition(None, None, "row", 10);

    assert_eq!(
        serde_json::to_string(&auto.document).unwrap(),
        serde_json::to_string(&default.document).unwrap()
    );
    assert_eq!(cell_pos(&auto.document.pages[0], "c0"), (0.0, 0.0));
}

/// Column-major fill wraps at each page's OWN row count: 3 on the short
/// first page, 4 on the full ones.
#[test]
fn auto_column_direction_wraps_at_the_short_pages_row_count() {
    let out = imposition(Some(12.0), Some("auto"), "column", 8);

    assert_eq!(cell_pos(&out.document.pages[0], "c0"), (0.0, 12.0));
    assert_eq!(cell_pos(&out.document.pages[0], "c1"), (0.0, 112.0));
    assert_eq!(cell_pos(&out.document.pages[0], "c2"), (0.0, 212.0));
    // The fourth element wraps to the next column, not the next row.
    assert_eq!(cell_pos(&out.document.pages[0], "c3"), (200.0, 12.0));
    assert_eq!(cell_pos(&out.document.pages[0], "c5"), (200.0, 212.0));
    // The next page wraps after four.
    assert_eq!(cell_pos(&out.document.pages[1], "c6"), (0.0, 0.0));
    assert_eq!(cell_pos(&out.document.pages[1], "c7"), (0.0, 100.0));
}

/// 6 on the short page then 8 per page: 15 elements need three pages, and
/// none of them may be dropped.
#[test]
fn auto_paginates_the_remainder_at_the_full_page_rate() {
    let out = imposition(Some(12.0), Some("auto"), "row", 15);

    assert_eq!(out.document.pages.len(), 3);
    assert_eq!(cell_boxes(&out, 0).len(), 6);
    assert_eq!(cell_boxes(&out, 1).len(), 8);
    assert_eq!(cell_boxes(&out, 2).len(), 1);
    let labels = placed_labels(&out);
    assert_eq!(labels.len(), 15);
    assert!(labels.contains(&"c0".to_string()));
    assert!(labels.contains(&"c14".to_string()));
}
