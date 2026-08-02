//! Ruby (`markup: aozora`): placement above/beside base runs, shrink to
//! fit, markup warnings, and the verbatim default.

use super::{grid_template, main_block};
use crate::common::*;

#[test]
fn horizontal_ruby_centers_above_its_base_run() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: 吾輩《わがはい》は\n        grid: { charsPerLine: 4, lines: 1, cellSize: 20 }\n        markup: aozora\n        rubySize: 8\n        box: { padding: { top: 10 } }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    let page = &doc.pages[0];
    // Base cells hold 吾輩は (no markup chars drawn).
    assert_eq!(line_texts(main_block(page)), vec!["吾", "輩", "は"]);
    let ruby = text_blocks(page)
        .into_iter()
        .find(|b| b.font_size == 8.0)
        .expect("ruby block");
    let line = &ruby.lines[0];
    assert_eq!(line.text, "わがはい");
    // 4 chars × 8pt = 32pt centered over the 40pt 2-cell run, above it.
    assert_eq!(line.x, (40.0 - 32.0) / 2.0);
    assert_eq!(line.y, 10.0 - 8.0);
}

#[test]
fn ruby_shrinks_to_fit_and_warns_at_the_floor() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: 船《ふねふねふね》\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n        markup: aozora\n        rubySize: 8\n        box: { padding: { top: 10 } }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    // 6 chars over one 20pt cell: 8pt→2.67 fit clamps at the 4pt floor
    // and still overflows → warned.
    let ruby = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.font_size == 4.0)
        .expect("floored ruby block");
    assert_eq!(ruby.lines[0].text, "ふねふねふね");
    assert!(diags.iter().any(|d| d.code == "ruby_overflow"));
}

#[test]
fn vertical_ruby_stacks_right_of_the_column() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: 船《ふね》\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20, lineGap: 10 }\n        writingMode: vertical_rl\n        markup: aozora\n        rubySize: 8\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let ruby = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.font_size == 8.0)
        .expect("ruby block");
    // The reading is ONE vertical column (shaped vert advances at draw),
    // right of the (single, rightmost) base column, centered in the
    // lineGap: x = cell 20 + (10 - 8) / 2; its 2 × 8pt extent centered
    // along the 20pt base cell.
    assert_eq!(line_texts(ruby), vec!["ふね"]);
    assert_eq!(ruby.vertical, Some(shojiku_core::TextOrientation::Upright));
    assert_eq!(ruby.lines[0].x, 21.0);
    assert_eq!(ruby.lines[0].y, (20.0 - 16.0) / 2.0);
    assert_eq!(ruby.lines[0].width, 16.0);
}

#[test]
fn base_run_wrapping_lines_splits_the_reading() {
    // 吾輩 wraps: 吾 ends line 0, 輩 opens line 1 → the reading splits
    // proportionally (2 chars each) across two ruby blocks.
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あ吾輩《わがはい》\n        grid: { charsPerLine: 2, lines: 2, cellSize: 20, lineGap: 12 }\n        markup: aozora\n        rubySize: 8\n        box: { padding: { top: 10 } }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let rubies: Vec<&TextBlock> = text_blocks(&doc.pages[0])
        .into_iter()
        .filter(|b| b.font_size == 8.0)
        .collect();
    assert_eq!(rubies.len(), 2);
    assert_eq!(rubies[0].lines[0].text, "わが");
    assert_eq!(rubies[1].lines[0].text, "はい");
    // The second part sits over 輩's cell on line 1.
    assert_eq!(rubies[1].lines[0].y, 10.0 + 32.0 - 8.0);
}

#[test]
fn ruby_on_an_earlier_sheet_is_skipped_when_building_later_sheets() {
    // 2 cells/sheet: 船《ふね》 lands on sheet 1; the later sheets must
    // not re-emit its reading.
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: 船《ふね》とでる\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n        markup: aozora\n        box: { padding: { top: 10 } }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let rubies: Vec<&TextBlock> = text_blocks(&doc.pages[0])
        .into_iter()
        .filter(|b| b.lines.first().is_some_and(|l| l.text == "ふね"))
        .collect();
    assert_eq!(rubies.len(), 1);
}

#[test]
fn control_char_base_yields_no_cells_and_no_ruby() {
    // A `\r` base parses but assigns no cell — the reading has nowhere
    // to go and must degrade to nothing, not panic.
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: \"あ\\r《ふね》\"\n        grid: { charsPerLine: 4, lines: 1, cellSize: 20 }\n        markup: aozora\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    assert!(!text_blocks(&doc.pages[0])
        .iter()
        .any(|b| b.lines.iter().any(|l| l.text.contains('ふ'))));
}

#[test]
fn markup_mistakes_warn_and_render_literally() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: 船《ふね\n        grid: { charsPerLine: 4, lines: 1, cellSize: 20 }\n        markup: aozora\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "ruby_markup_invalid"));
    assert_eq!(
        line_texts(main_block(&doc.pages[0])),
        vec!["船", "《", "ふ", "ね"]
    );
}

#[test]
fn without_markup_the_notation_renders_verbatim() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: 船《ふね》\n        grid: { charsPerLine: 5, lines: 1, cellSize: 20 }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    assert_eq!(
        line_texts(main_block(&doc.pages[0])),
        vec!["船", "《", "ふ", "ね", "》"]
    );
}

#[test]
fn bound_params_take_markup_only_when_opted_in() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        data: { key: manuscript }\n        grid: { charsPerLine: 4, lines: 1, cellSize: 20 }\n        markup: aozora\n        box: { padding: { top: 10 } }\n",
    );
    let (doc, _) = run(&yaml, json!({"manuscript": "船《ふね》で"}));
    let page = &doc.pages[0];
    assert_eq!(line_texts(main_block(page)), vec!["船", "で"]);
    assert!(text_blocks(page).iter().any(|b| b.lines[0].text == "ふね"));
}

#[test]
fn a_vertical_reading_shrinks_to_fit_and_warns_at_the_floor() {
    // The vertical arm of the shrink: 6 reading chars over one 20pt cell
    // (shaped vert extents) clamp at the 4pt floor and still overflow.
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: 船《ふねふねふね》\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20, lineGap: 10 }\n        writingMode: vertical_rl\n        markup: aozora\n        rubySize: 8\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    let ruby = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.font_size == 4.0)
        .expect("floored ruby block");
    assert_eq!(ruby.lines[0].text, "ふねふねふね");
    assert!(diags.iter().any(|d| d.code == "ruby_overflow"));
}
