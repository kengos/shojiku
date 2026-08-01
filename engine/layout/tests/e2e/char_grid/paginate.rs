//! Sheet pagination in a flow body, blank sheets, and the box index.

use super::{grid_rects, grid_template, main_block};
use crate::common::*;

#[test]
fn sheets_paginate_when_the_region_fills() {
    // Sheet = 2x2 cells of 20pt = 40pt tall; a 70pt page fits one sheet
    // per page. 12 chars = 6 lines = 3 sheets = 3 pages.
    let yaml = grid_template(
        100.0,
        70.0,
        "        text: あいうえおかきくけこさし\n        grid: { charsPerLine: 2, lines: 2, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    assert_eq!(doc.pages.len(), 3);
    assert_eq!(all_text(&doc.pages[0]).replace('\n', ""), "あいうえ");
    assert!(all_text(&doc.pages[2]).contains('し'));
    // Every page draws the FULL grid, content or not.
    for page in &doc.pages {
        assert_eq!(grid_rects(page).len(), 4);
    }
}

#[test]
fn short_sheets_stack_on_one_page() {
    let yaml = grid_template(
        100.0,
        200.0,
        "        text: あいうえおか\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    assert_eq!(doc.pages.len(), 1);
    // 3 sheets of one 20pt line each, stacked at the cursor.
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(blocks.len(), 3);
    assert_eq!(blocks[0].lines[0].y, 5.0);
    assert_eq!(blocks[1].lines[0].y, 25.0);
    assert_eq!(blocks[2].lines[0].y, 45.0);
}

#[test]
fn empty_content_draws_one_blank_sheet() {
    let yaml = grid_template(
        100.0,
        200.0,
        "        text: \"\"\n        grid: { charsPerLine: 3, lines: 2, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    assert_eq!(doc.pages.len(), 1);
    assert_eq!(grid_rects(&doc.pages[0]).len(), 6);
    assert!(main_block(&doc.pages[0]).lines.is_empty());
}

#[test]
fn id_lands_in_the_box_index_per_sheet_page() {
    let yaml = grid_template(
        100.0,
        70.0,
        "        id: manuscript\n        text: あいうえおかきく\n        grid: { charsPerLine: 2, lines: 2, cellSize: 20 }\n",
    );
    let out = run_full(&yaml, json!({}));
    assert_eq!(out.document.pages.len(), 2);
    for page_boxes in &out.boxes.pages {
        assert!(page_boxes
            .iter()
            .any(|b| b.id.as_deref() == Some("manuscript")));
    }
}

#[test]
fn hostile_content_stops_at_the_page_cap() {
    // The first grid fills exactly MAX_PAGES (one 2x2 sheet per page);
    // the second finds the cap exhausted and must stop sheet-by-sheet
    // without looping.
    let first = "あ".repeat(MAX_PAGES * 4);
    let yaml = grid_template(
        100.0,
        70.0,
        &format!(
            "        text: {first}\n        grid: {{ charsPerLine: 2, lines: 2, cellSize: 20 }}\n      - type: char_grid\n        text: いいいいいいいい\n        grid: {{ charsPerLine: 2, lines: 2, cellSize: 20 }}\n"
        ),
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert_eq!(doc.pages.len(), MAX_PAGES);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
    assert!(!all_text(&doc.pages[MAX_PAGES - 1]).contains('い'));
}
