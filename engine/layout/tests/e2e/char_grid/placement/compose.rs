//! Placement compositions: a 作文-style title sheet (title + bottom-flush
//! author), the end-align overrides beating the item `textAlign`, and the
//! `［＃中央］` + 大書き combo. `cellSize` equals the 10pt font, so a
//! glyph's `x` is its cell origin.

use super::super::{grid_template, main_block};
use super::{cell_x, placed};
use crate::common::*;

#[test]
fn a_title_sheet_indents_the_title_and_flushes_the_author() {
    // 題名 on line 0 2字下げ; 著者 on line 2 地付き.
    let yaml = placed(
        "［＃２字下げ］題名\\n\\n［＃地付き］著者",
        "{ charsPerLine: 8, lines: 4, cellSize: 10 }",
        None,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    let page = &doc.pages[0];
    // 題 sits at cell 2 (indent → x 20).
    assert_eq!(cell_x(page, '題'), 20.0);
    // 著者 = 2 chars, 8-cell line, 地付き → cells 6,7 (x 60, 70).
    assert_eq!(cell_x(page, '著'), 60.0);
    assert_eq!(cell_x(page, '者'), 70.0);
}

#[test]
fn center_places_a_line_in_the_middle() {
    // 題名 = 2 chars, 6-cell line, 中央 → free 4, shift 2 → cells 2,3.
    let yaml = placed(
        "［＃中央］題名",
        "{ charsPerLine: 6, lines: 2, cellSize: 10 }",
        None,
    );
    let (doc, _) = run(&yaml, json!({}));
    assert_eq!(cell_x(&doc.pages[0], '題'), 20.0);
}

#[test]
fn a_placement_overrides_the_item_text_align() {
    // The item says right, but the line's 中央 note wins.
    let yaml = placed(
        "［＃中央］題名",
        "{ charsPerLine: 6, lines: 2, cellSize: 10 }",
        Some("right"),
    );
    let (doc, _) = run(&yaml, json!({}));
    // Center (cell 2, x 20), not right (cell 4, x 40).
    assert_eq!(cell_x(&doc.pages[0], '題'), 20.0);
}

#[test]
fn a_vertical_title_flushes_the_author_down_the_column() {
    // vertical_rl: 地付き is 下寄せ. 著者 sits at the bottom of its column.
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: ［＃地付き］著者\n        grid: { charsPerLine: 4, lines: 2, cellSize: 20 }\n        writingMode: vertical_rl\n        markup: aozora\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    // 著 above 者 (smaller y), both pushed toward the column end (large y).
    let ys: Vec<f64> = block.lines.iter().map(|l| l.y).collect();
    assert!(
        ys.iter().all(|&y| y > 20.0),
        "flushed down the column: {ys:?}"
    );
}

#[test]
fn a_centered_span_shifts_the_block_row() {
    // ［＃中央］ then a 2×2 大書き block on a 6-cell grid (cell 20, base font
    // 10 → block font 20). Block right edge = cell 1, free 4, shift 2 → the
    // block starts at cell 2 (x 40); a 20pt glyph in the 40pt block → +10.
    let yaml = grid_template(
        300.0,
        300.0,
        "        text: ［＃中央］題［＃「題」は大書き］\n        grid: { charsPerLine: 6, lines: 6, cellSize: 20 }\n        markup: aozora\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    let block = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.font_size == 20.0)
        .expect("2×2 block");
    assert_eq!(block.lines[0].x, 50.0);
}

#[test]
fn ruby_follows_an_indented_base() {
    // Readings key off cell positions, so a 字下げ-shifted base carries
    // its ruby with it: 船 sits at cell 2 (x 20) and the reading (2 chars
    // at the default 0.4 × cell = 4pt) centers over that cell.
    let yaml = placed(
        "［＃２字下げ］船《ふね》",
        "{ charsPerLine: 6, lines: 2, cellSize: 10 }",
        None,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    let page = &doc.pages[0];
    assert_eq!(cell_x(page, '船'), 20.0);
    let ruby = text_blocks(page)
        .into_iter()
        .find(|b| b.font_size == 4.0)
        .expect("ruby block");
    assert_eq!(ruby.lines[0].text, "ふね");
    assert_eq!(ruby.lines[0].x, 20.0 + (10.0 - 8.0) / 2.0);
}

#[test]
fn a_mid_line_placement_note_stays_verbatim_and_warns() {
    let yaml = placed(
        "本文［＃中央］の後",
        "{ charsPerLine: 20, lines: 2, cellSize: 12 }",
        None,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "ruby_markup_invalid"));
    // The note renders as literal cells (single chars, joined by newlines
    // in all_text — check a distinctive note char is present).
    assert!(all_text(&doc.pages[0]).contains('中'));
}
