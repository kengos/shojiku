//! Hostile-input guards: grid caps, cell-size validation, band/absolute
//! placement, and missing content. (Container/cell placement lives in
//! `containers.rs`.)

use super::{grid_rects, grid_template, main_block};
use crate::common::*;

#[test]
fn oversized_grids_clamp_with_a_diagnostic() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あ\n        grid: { charsPerLine: 100000, lines: 100000, cellSize: 1 }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "char_grid_clamped"));
}

#[test]
fn zero_dimensions_clamp_to_one() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あい\n        grid: { charsPerLine: 0, lines: 0, cellSize: 20 }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "char_grid_clamped"));
    // 1x1 grid: あ on sheet 1, い on sheet 2.
    assert_eq!(grid_rects(&doc.pages[0]).len(), 2);
}

#[test]
fn non_positive_cell_size_skips_the_item() {
    for bad in ["0", "-5"] {
        let yaml = grid_template(
            200.0,
            200.0,
            &format!(
                "        text: あ\n        grid: {{ charsPerLine: 2, lines: 1, cellSize: {bad} }}\n"
            ),
        );
        let (doc, diags) = run(&yaml, json!({}));
        assert!(
            diags.iter().any(|d| d.code == "invalid_cell_size"),
            "cellSize {bad}"
        );
        assert!(grid_rects(&doc.pages[0]).is_empty());
    }
}

#[test]
fn missing_content_warns_and_skips() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "empty_char_grid_item"));
    assert!(grid_rects(&doc.pages[0]).is_empty());
}

#[test]
fn missing_data_key_draws_a_blank_sheet() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        data: { key: nope }\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "missing_data"));
    assert_eq!(grid_rects(&doc.pages[0]).len(), 2);
}

#[test]
fn band_grid_draws_one_sheet_and_warns_on_overflow() {
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  header:\n    items:\n      - type: char_grid\n        box: { x: 10, y: 30, w: 100 }\n        text: あいうえおか\n        grid: { charsPerLine: 2, lines: 2, cellSize: 20 }\n        style: { fontFamily: biz-ud-gothic, fontSize: 10 }\n  body:\n    type: flow\n    items: []\n";
    let (doc, diags) = run(yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "char_grid_overflow"));
    let page = &doc.pages[0];
    // One 2x2 sheet at the authored offset; おか was dropped.
    let rects = grid_rects(page);
    assert_eq!(rects.len(), 4);
    assert_eq!((rects[0].x, rects[0].y), (10.0, 30.0));
    assert_eq!(all_text(page).replace('\n', ""), "あいうえ");
}

#[test]
fn absolute_body_places_at_the_authored_offset() {
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: absolute\n    items:\n      - type: char_grid\n        box: { x: 5, y: 40, w: 100 }\n        text: あ\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n        style: { fontFamily: biz-ud-gothic, fontSize: 10 }\n";
    let (doc, _) = run(yaml, json!({}));
    let rects = grid_rects(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].y), (5.0, 40.0));
    assert_eq!(main_block(&doc.pages[0]).lines[0].y, 45.0);
}

#[test]
fn negative_gaps_clamp_to_zero() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あい\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20, charGap: -10 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let rects = grid_rects(&doc.pages[0]);
    // Cells abut instead of overlapping.
    assert_eq!(rects[1].x, 20.0);
}
