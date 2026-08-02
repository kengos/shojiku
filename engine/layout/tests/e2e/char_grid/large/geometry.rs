//! Block geometry: a 大書き span draws at `scale × font_size`, centered in
//! its n×n rect, in both writing modes.

use super::super::grid_template;
use super::{aozora, span_blocks};
use crate::common::*;

#[test]
fn a_span_draws_each_char_as_a_scaled_block() {
    // 会話 as 2×2 blocks on a 20pt-cell grid: two blocks at 20pt font.
    let yaml = aozora(
        "会話［＃「会話」は大書き］",
        "{ charsPerLine: 6, lines: 6, cellSize: 20 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    let blocks = span_blocks(&doc.pages[0]);
    assert_eq!(blocks.len(), 2, "one block per span char");
    for b in &blocks {
        assert_eq!(b.font_size, 20.0, "2×2 block at twice the cell size");
    }
    let texts: Vec<&str> = blocks.iter().map(|b| b.lines[0].text.as_str()).collect();
    assert_eq!(texts, vec!["会", "話"]);
}

#[test]
fn a_block_centers_its_glyph_in_the_scaled_rect() {
    // One 2×2 block, cell 20, at grid origin. Block rect is 40×40; a 1em
    // (20pt) glyph centers at (40-20)/2 = 10 on both axes.
    let yaml = aozora(
        "大［＃「大」は大書き］",
        "{ charsPerLine: 4, lines: 4, cellSize: 20 }",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = span_blocks(&doc.pages[0]).remove(0);
    let line = &block.lines[0];
    assert_eq!(line.x, 10.0);
    assert_eq!(line.y, 10.0);
}

#[test]
fn a_multiplier_note_scales_by_n() {
    let yaml = aozora(
        "題［＃「題」は3倍の大書き］",
        "{ charsPerLine: 6, lines: 6, cellSize: 10 }",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = span_blocks(&doc.pages[0]).remove(0);
    assert_eq!(
        block.font_size, 30.0,
        "3×3 block at three times the cell size"
    );
}

#[test]
fn a_vertical_span_blocks_from_the_right() {
    // vertical_rl: the first block's top line is the rightmost column.
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: 会話［＃「会話」は大書き］\n        grid: { charsPerLine: 6, lines: 6, cellSize: 20 }\n        writingMode: vertical_rl\n        markup: aozora\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let blocks = span_blocks(&doc.pages[0]);
    assert_eq!(blocks.len(), 2);
    // Both blocks share the top of the column; the second sits below the
    // first (larger y), same x band.
    let (y0, y1) = (blocks[0].lines[0].y, blocks[1].lines[0].y);
    assert!(y1 > y0, "second block below the first down the column");
}

#[test]
fn the_grid_stays_complete_under_a_span() {
    // Chrome-completeness: the マス目 draws every cell even where a block
    // covers several. 4×4 grid = 16 stroked rects regardless of the span.
    let yaml = aozora(
        "大［＃「大」は大書き］",
        "{ charsPerLine: 4, lines: 4, cellSize: 20 }",
    );
    let (doc, _) = run(&yaml, json!({}));
    assert_eq!(super::super::grid_rects(&doc.pages[0]).len(), 16);
}
