//! Vertical writing (`vertical_rl`): right-to-left columns, and the
//! GSUB-`vert` contract — the tree carries the AUTHORED characters as
//! one-cell vertical columns (`vertical: Some(Upright)`); substitution
//! and punctuation placement happen in the shared arrangement at draw
//! time, exactly like a vertical text block.

use super::{grid_rects, grid_template, main_block};
use crate::common::*;
use shojiku_core::TextOrientation;

fn vertical_item(text: &str, extra: &str) -> String {
    format!(
        "        text: {text}\n        grid: {{ charsPerLine: 2, lines: 2, cellSize: 20 }}\n        writingMode: vertical_rl\n{extra}"
    )
}

#[test]
fn columns_run_right_to_left() {
    let yaml = grid_template(200.0, 200.0, &vertical_item("あいうえ", ""));
    let (doc, _) = run(&yaml, json!({}));
    let page = &doc.pages[0];
    let block = main_block(page);
    // Cells are one-char vertical columns the renderers arrange with
    // GSUB `vert`; the column box is the cell rect, the shaped 1em
    // extent (fixed-pitch face) centered in it.
    assert_eq!(block.vertical, Some(TextOrientation::Upright));
    assert_eq!(block.line_height, 20.0, "column width = cell");
    // Line 0 (あい) is the RIGHTMOST column (grid is 2 columns wide).
    assert_eq!((block.lines[0].x, block.lines[0].y), (20.0, 5.0));
    assert_eq!((block.lines[1].x, block.lines[1].y), (20.0, 25.0));
    // Line 1 (うえ) is one column left.
    assert_eq!((block.lines[2].x, block.lines[2].y), (0.0, 5.0));
    // Grid rects mirror: 4 cells, first line's at x 20.
    let rects = grid_rects(page);
    assert_eq!(rects.len(), 4);
    assert_eq!(rects[0].x, 20.0);
}

#[test]
fn tree_carries_authored_brackets_for_the_vert_arrangement() {
    let yaml = grid_template(200.0, 200.0, &vertical_item("「あ」", ""));
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    // The AUTHORED brackets stay in the tree — the renderers' shared
    // vertical arrangement serves the font's vert alternates (or the
    // closed forms table on the degrade path), so no presentation form
    // is baked into the contract anymore.
    assert_eq!(line_texts(block), vec!["「", "あ", "」"]);
    assert_eq!(block.vertical, Some(TextOrientation::Upright));
}

#[test]
fn punctuation_placement_is_font_authoritative() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あ。\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n        writingMode: vertical_rl\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    let maru = &block.lines[1];
    assert_eq!(maru.text, "。");
    // No engine nudge in the tree: the cell column sits at its cell rect
    // ((0, 20) + the 1em extent centered), and the font's vert glyph
    // positions the ink (top-right in any CJK face) at draw time.
    assert_eq!((maru.x, maru.y), (0.0, 25.0));
}

#[test]
fn long_vowel_and_small_kana_stay_authored_in_the_tree() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: ニャー\n        grid: { charsPerLine: 3, lines: 1, cellSize: 20 }\n        writingMode: vertical_rl\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    // ャ carries no tree-level nudge (the vert glyph/degrade nudge is the
    // arrangement's job); ー now ROTATES via GSUB `vert` at draw time —
    // the tree keeps the authored char, centered like any cell.
    assert_eq!(block.lines[1].text, "ャ");
    assert_eq!((block.lines[1].x, block.lines[1].y), (0.0, 25.0));
    assert_eq!(block.lines[2].text, "ー");
    assert_eq!((block.lines[2].x, block.lines[2].y), (0.0, 45.0));
}

#[test]
fn hanging_punctuation_hangs_below_the_shared_cell() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あい。\n        grid: { charsPerLine: 2, lines: 2, cellSize: 20 }\n        writingMode: vertical_rl\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    let maru = &block.lines[2];
    assert_eq!(maru.text, "。");
    // い's cell (rightmost column, second cell, y 20 + centering 5) plus
    // the half-cell hang shift down; the vert glyph's own top-right ink
    // then reads in the trailing corner.
    assert_eq!((maru.x, maru.y), (20.0, 25.0 + 10.0));
}

#[test]
fn derived_cell_size_divides_width_by_lines() {
    let yaml = grid_template(
        100.0,
        200.0,
        "        text: あ\n        grid: { charsPerLine: 5, lines: 2 }\n        writingMode: vertical_rl\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let rects = grid_rects(&doc.pages[0]);
    // Two 50pt-wide columns of five cells.
    assert_eq!(rects.len(), 10);
    assert_eq!(rects[0].w, 50.0);
}
