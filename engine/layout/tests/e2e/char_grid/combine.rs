//! 縦中横 in a vertical `char_grid`: consecutive digit runs up to the
//! knob share one cell; horizontal grids and 大書き spans never combine.

use super::{grid_template, main_block};
use crate::common::*;

/// The 大書き block text blocks (font size larger than the 10pt cells).
fn span_blocks(page: &LayoutPage) -> Vec<&TextBlock> {
    text_blocks(page)
        .into_iter()
        .filter(|b| b.font_size > 10.0)
        .collect()
}

#[test]
fn a_digit_pair_shares_one_cell_in_a_vertical_grid() {
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: 平成8年12月\n        grid: { charsPerLine: 4, lines: 2, cellSize: 20 }\n        writingMode: vertical_rl\n        styleNames: [combine2]\n",
    );
    let yaml = format!("styles:\n  combine2: {{ textCombineUpright: {{ digits: 2 }} }}\n{yaml}");
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let block = main_block(&doc.pages[0]);
    let texts = line_texts(block);
    // 平成8年 fill line 0; the PAIR takes one cell of line 1.
    assert_eq!(texts, vec!["平", "成", "8", "年", "12", "月"]);
    assert_eq!(
        block.text_combine,
        Some(shojiku_core::TextCombine::Digits(2)),
        "threaded to the renderers"
    );
}

#[test]
fn a_horizontal_grid_never_combines() {
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: 12月\n        grid: { charsPerLine: 4, lines: 1, cellSize: 20 }\n        styleNames: [combine2]\n",
    );
    let yaml = format!("styles:\n  combine2: {{ textCombineUpright: {{ digits: 2 }} }}\n{yaml}");
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    assert_eq!(line_texts(block), vec!["1", "2", "月"]);
    assert_eq!(block.text_combine, None);
}

#[test]
fn a_large_span_takes_precedence_over_combining() {
    // 大書き reworks its chars into n×n blocks — digits inside one never
    // group into a shared cell.
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: 12［＃「12」は大書き］\n        grid: { charsPerLine: 6, lines: 6, cellSize: 20 }\n        writingMode: vertical_rl\n        markup: aozora\n        styleNames: [combine2]\n",
    );
    let yaml = format!("styles:\n  combine2: {{ textCombineUpright: {{ digits: 2 }} }}\n{yaml}");
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    // Two 2×2 blocks at 20pt — no combined "12" cell anywhere.
    let blocks = span_blocks(&doc.pages[0]);
    assert_eq!(blocks.len(), 2);
    let main = main_block(&doc.pages[0]);
    assert!(line_texts(main).iter().all(|t| t != "12"));
}
