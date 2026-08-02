//! 大書き compositions: ruby over a span, the clamp diagnostic, a span in
//! a paginating flow, and the verbatim default without `markup: aozora`.

use super::super::{grid_template, main_block};
use super::{aozora, span_blocks};
use crate::common::*;

#[test]
fn ruby_rides_the_full_block_run_extent() {
    // 会話《かいわ》 then 大書き: the reading sits above the 2-block run,
    // which occupies 2 blocks × 2 cells = 4 grid-cells (80pt) of extent.
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: 会話《かいわ》［＃「会話」は大書き］\n        grid: { charsPerLine: 6, lines: 6, cellSize: 20 }\n        markup: aozora\n        rubySize: 8\n        box: { padding: { top: 12 } }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    let page = &doc.pages[0];
    // The base draws as 2 enlarged blocks, not in the base cell block.
    assert_eq!(span_blocks(page).len(), 2);
    let ruby = text_blocks(page)
        .into_iter()
        .find(|b| b.font_size == 8.0)
        .expect("ruby block");
    // かいわ = 3 chars × 8pt = 24pt centered over the 80pt block run.
    assert_eq!(ruby.lines[0].text, "かいわ");
    assert_eq!(ruby.lines[0].x, (80.0 - 24.0) / 2.0);
}

#[test]
fn vertical_ruby_stacks_right_of_a_span_block_run() {
    // 縦書き: the reading is one vertical column right of the block
    // run's rightmost column, centered along the full block extent.
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: 会話《かいわ》［＃「会話」は大書き］\n        grid: { charsPerLine: 6, lines: 6, cellSize: 20, lineGap: 10 }\n        writingMode: vertical_rl\n        markup: aozora\n        rubySize: 8\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    let page = &doc.pages[0];
    assert_eq!(span_blocks(page).len(), 2);
    let ruby = text_blocks(page)
        .into_iter()
        .find(|b| b.font_size == 8.0)
        .expect("ruby block");
    // Rightmost column's right edge (grid_w 170 − cell 20 = x 150, + cell)
    // + centering in the 10pt lineGap band; the run is 2 blocks × 2 cells
    // = 80pt of extent, so the 3 × 8pt reading COLUMN starts at
    // (80 − 24) / 2.
    assert_eq!(line_texts(ruby), vec!["かいわ"]);
    assert_eq!(ruby.lines[0].x, 171.0);
    assert_eq!(ruby.lines[0].y, (80.0 - 24.0) / 2.0);
    assert_eq!(ruby.lines[0].width, 24.0);
}

#[test]
fn an_oversized_scale_is_clamped_to_the_grid() {
    // A 9× block on a 3×3 grid clamps to 3 (min of columns and lines);
    // base font 10 → a 3×3 block draws at 30pt.
    let yaml = aozora(
        "大［＃「大」は9倍の大書き］",
        "{ charsPerLine: 3, lines: 3, cellSize: 10 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "char_grid_markup_clamped"));
    let block = span_blocks(&doc.pages[0]).remove(0);
    assert_eq!(block.font_size, 30.0, "clamped to a 3×3 block");
}

#[test]
fn a_span_paginates_without_straddling_a_sheet() {
    // A 3×3 sheet exactly fills a 60pt page. 本論 as 2×2 blocks: 本 tops
    // the first sheet, 論 cannot fit under it and is pushed to a second
    // sheet — each page keeps a complete 3×3 grid.
    let yaml = aozora(
        "本論［＃「本論」は大書き］",
        "{ charsPerLine: 3, lines: 3, cellSize: 20 }",
    );
    // Override the page height to hold exactly one sheet.
    let yaml = yaml.replace("h: 300 }", "h: 60 }");
    let (doc, _) = run(&yaml, json!({}));
    assert!(
        doc.pages.len() >= 2,
        "the span paginates onto a second sheet"
    );
    for page in &doc.pages {
        assert_eq!(super::super::grid_rects(page).len(), 9, "complete 3×3 grid");
    }
}

#[test]
fn a_span_in_a_band_drops_overflow_on_the_single_sheet() {
    // A char_grid in a footer band draws exactly one sheet. あいうえ as
    // 2×2 blocks needs two block rows, but the 2-line sheet holds one, so
    // the overflow is dropped with char_grid_overflow.
    let yaml = "page:\n  size: { w: 300, h: 300 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items: []\n  footer:\n    height: 40\n    items:\n      - type: char_grid\n        style: { fontFamily: biz-ud-gothic, fontSize: 5 }\n        text: あいうえ［＃「あいうえ」は大書き］\n        grid: { charsPerLine: 4, lines: 2, cellSize: 5 }\n        markup: aozora\n";
    let (_, diags) = run(yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "char_grid_overflow"));
}

#[test]
fn without_the_markup_opt_in_the_note_is_verbatim() {
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: 大［＃「大」は大書き］\n        grid: { charsPerLine: 20, lines: 2, cellSize: 12 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let page = &doc.pages[0];
    assert!(span_blocks(page).is_empty(), "no enlarged block");
    // Every note character occupies its own cell verbatim (all_text joins
    // cells with newlines, so check a distinctive note char).
    assert!(all_text(page).contains('書'));
    assert_eq!(main_block(page).lines[0].text, "大");
}
