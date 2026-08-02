//! char_grid inside containers and repeat/repeat_flow cells: flex-row
//! entry boxes, absolute children, element-scoped bindings (the
//! data-driven 漢字ドリル case), and single-sheet overflow semantics.

use super::{grid_rects, main_block};
use crate::common::*;

#[test]
fn flex_row_hosts_label_and_entry_boxes() {
    // The acceptance-run ask: a 〒 label and digit boxes side by side
    // in one flex row — no absolute coordinates.
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: container\n        box: { w: 200, direction: row, gap: 4 }\n        items:\n          - { type: text, text: 〒, box: { w: 12 }, style: { fontFamily: biz-ud-gothic, fontSize: 10 } }\n          - type: char_grid\n            box: { w: 60 }\n            text: \"\"\n            grid: { charsPerLine: 3, lines: 1, cellSize: 16 }\n";
    let (doc, diags) = run(yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "char_grid_in_container"));
    let rects = grid_rects(&doc.pages[0]);
    assert_eq!(rects.len(), 3);
    // The grid starts at its planned row slot (after the 12pt label +
    // 4pt gap), not at x 0.
    assert_eq!(rects[0].x, 16.0);
    assert_eq!(rects[1].x, 32.0);
}

#[test]
fn absolute_child_places_at_authored_offsets() {
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: container\n        box: { w: 200, h: 100 }\n        items:\n          - type: char_grid\n            box: { x: 10, y: 20, w: 80 }\n            text: あ\n            grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n            style: { fontFamily: biz-ud-gothic, fontSize: 10 }\n";
    let (doc, _) = run(yaml, json!({}));
    let rects = grid_rects(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].y), (10.0, 20.0));
    assert_eq!(main_block(&doc.pages[0]).lines[0].y, 25.0);
}

#[test]
fn repeat_flow_cards_bind_per_element_kanji_rows() {
    // Data-driven drill rows: one card per element, each with its own
    // お手本 grid bound to the element's fields.
    let yaml = "page:\n  size: { w: 200, h: 400 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: repeat_flow\n        data: { key: words }\n        gap: 6\n        item:\n          items:\n            - type: char_grid\n              box: { w: 200 }\n              text: \"{kanji}\"\n              markup: aozora\n              grid: { charsPerLine: 8, lines: 1, cellSize: 20 }\n              style: { fontFamily: biz-ud-gothic, fontSize: 10 }\n";
    let params = json!({"words": [
        {"kanji": "船《ふね》"},
        {"kanji": "海《うみ》"},
    ]});
    let (doc, diags) = run(yaml, params);
    assert!(diags.iter().all(|d| d.code != "char_grid_in_container"));
    let page = &doc.pages[0];
    let texts = all_text(page).replace('\n', "");
    assert!(texts.contains('船') && texts.contains('海'), "{texts}");
    // Each element's reading rides its own card's grid.
    assert!(text_blocks(page).iter().any(|b| b.lines[0].text == "ふね"));
    assert!(text_blocks(page).iter().any(|b| b.lines[0].text == "うみ"));
    // Two cards of one line each: 16 stroked cells.
    assert_eq!(grid_rects(page).len(), 16);
}

#[test]
fn repeat_cell_grid_reads_the_bound_element() {
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: repeat\n        data: { key: tickets }\n        grid: { columns: 2, rows: 1 }\n        cell:\n          items:\n            - type: char_grid\n              data: { key: code }\n              grid: { charsPerLine: 4, lines: 1, cellSize: 12 }\n              style: { fontFamily: biz-ud-gothic, fontSize: 8 }\n";
    let params = json!({"tickets": [{"code": "1234"}, {"code": "5678"}]});
    let (doc, diags) = run(yaml, params);
    assert!(diags.iter().all(|d| d.code != "char_grid_in_container"));
    let texts = all_text(&doc.pages[0]).replace('\n', "");
    assert!(texts.contains("1234") && texts.contains("5678"), "{texts}");
}

#[test]
fn container_grid_draws_one_sheet_and_warns_on_overflow() {
    // Band semantics inside a box: no pagination, extra chars drop.
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: container\n        box: { w: 200 }\n        items:\n          - type: char_grid\n            box: { w: 100 }\n            text: あいうえおか\n            grid: { charsPerLine: 2, lines: 2, cellSize: 20 }\n            style: { fontFamily: biz-ud-gothic, fontSize: 10 }\n";
    let (doc, diags) = run(yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "char_grid_overflow"));
    assert_eq!(all_text(&doc.pages[0]).replace('\n', ""), "あいうえ");
}

#[test]
fn container_style_cascades_inherited_keys_into_the_grid() {
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: container\n        box: { w: 200 }\n        style: { color: \"#ff0000\", fontFamily: biz-ud-gothic }\n        items:\n          - type: char_grid\n            text: あ\n            grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n";
    let (doc, _) = run(yaml, json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.color, (1.0, 0.0, 0.0));
    // fontSize stays cell-relative (0.7 × 20) — inherited sizes are
    // deliberately not honored (documented).
    assert_eq!(block.font_size, 14.0);
}
