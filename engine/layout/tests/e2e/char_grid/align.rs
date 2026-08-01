//! `textAlign` end-alignment: which cells a partly filled line occupies,
//! horizontally and in vertical writing, and whose style is read.

use super::main_block;
use crate::common::*;

/// A one-item flow template on a margin-less 200pt page with the
/// fixed-pitch face (every full-width glyph exactly 1em). `style_keys`
/// is appended INSIDE the item's style map, so each test authors its own
/// alignment without a second `style:` key.
fn grid(style_keys: &str, item_lines: &str) -> String {
    format!(
        "page:\n  size: {{ w: 200, h: 200 }}\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: char_grid\n        style: {{ fontFamily: biz-ud-gothic, fontSize: 10{style_keys} }}\n{item_lines}"
    )
}

/// A one-line 5-cell entry grid of 20pt cells holding 山田.
fn entry_grid(style_keys: &str) -> String {
    grid(
        style_keys,
        "        text: 山田\n        grid: { charsPerLine: 5, lines: 1, cellSize: 20 }\n",
    )
}

/// The x of every drawn cell char, in content order.
fn xs(page: &LayoutPage) -> Vec<f64> {
    main_block(page).lines.iter().map(|l| l.x).collect()
}

#[test]
fn right_fills_the_line_end() {
    // 5 cells of 20pt: 山田 lands in cells 3 and 4, each char centered in
    // its cell (a 10pt full-width glyph in a 20pt cell => +5).
    let (doc, diags) = run(&entry_grid(", textAlign: right"), json!({}));
    assert_eq!(xs(&doc.pages[0]), vec![65.0, 85.0]);
    assert!(diags.is_empty());
}

#[test]
fn center_floors_toward_the_line_start() {
    // 3 free cells centered floors to a 1-cell shift: cells 1 and 2.
    let (doc, _) = run(&entry_grid(", textAlign: center"), json!({}));
    assert_eq!(xs(&doc.pages[0]), vec![25.0, 45.0]);
}

#[test]
fn left_is_the_default_and_unchanged() {
    let (doc, _) = run(&entry_grid(""), json!({}));
    assert_eq!(xs(&doc.pages[0]), vec![5.0, 25.0]);
    let (explicit, _) = run(&entry_grid(", textAlign: left"), json!({}));
    assert_eq!(xs(&explicit.pages[0]), vec![5.0, 25.0]);
}

#[test]
fn a_named_style_supplies_the_alignment() {
    let yaml = format!(
        "styles:\n  entry: {{ textAlign: right }}\n{}",
        grid(
            "",
            "        styleNames: [entry]\n        text: 山田\n        grid: { charsPerLine: 5, lines: 1, cellSize: 20 }\n"
        )
    );
    let (doc, _) = run(&yaml, json!({}));
    assert_eq!(xs(&doc.pages[0]), vec![65.0, 85.0]);
}

#[test]
fn an_inherited_alignment_is_ignored() {
    // Cells are cell-relative, like the font size: a body-level textAlign
    // must not silently shift a grid the author never aligned.
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\ndefaults:\n  style: { textAlign: right }\nsections:\n  body:\n    type: flow\n    items:\n      - type: char_grid\n        style: { fontFamily: biz-ud-gothic, fontSize: 10 }\n        text: 山田\n        grid: { charsPerLine: 5, lines: 1, cellSize: 20 }\n";
    let (doc, _) = run(yaml, json!({}));
    assert_eq!(xs(&doc.pages[0]), vec![5.0, 25.0]);
}

#[test]
fn a_full_line_never_moves() {
    // Wrapped body text keeps its assignment; only the short last line
    // has free cells to shift into.
    let yaml = grid(
        ", textAlign: right",
        "        text: あいうえおかき\n        grid: { charsPerLine: 5, lines: 2, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let lines = &main_block(&doc.pages[0]).lines;
    // Line 0 is full: it still starts at cell 0 and ends at cell 4.
    assert_eq!((lines[0].x, lines[0].y), (5.0, 5.0));
    assert_eq!(lines[4].x, 85.0);
    // Line 1 holds 2 of 5 cells and shifts to the line's end.
    assert_eq!((lines[5].x, lines[5].y), (65.0, 25.0));
    assert_eq!(lines[6].x, 85.0);
}

#[test]
fn vertical_right_fills_the_column_bottom() {
    // vertical_rl runs a line's cells DOWN a column, so the line's end is
    // its bottom: 山田 takes the column's last two cells.
    let yaml = grid(
        ", textAlign: right",
        "        writingMode: vertical_rl\n        text: 山田\n        grid: { charsPerLine: 5, lines: 1, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let ys: Vec<f64> = main_block(&doc.pages[0])
        .lines
        .iter()
        .map(|l| l.y)
        .collect();
    assert_eq!(ys, vec![65.0, 85.0]);
}

#[test]
fn ruby_follows_the_shifted_base() {
    // Readings key off cell positions, so alignment carries them for
    // free: the reading centers over the SHIFTED base run.
    let yaml = grid(
        ", textAlign: right",
        "        markup: aozora\n        text: 山田《やまだ》\n        rubySize: 8\n        grid: { charsPerLine: 5, lines: 1, cellSize: 20 }\n        box: { padding: { top: 10 } }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let page = &doc.pages[0];
    assert_eq!(xs(page), vec![65.0, 85.0]);
    let ruby = text_blocks(page)
        .into_iter()
        .find(|b| b.font_size == 8.0)
        .expect("ruby block");
    assert_eq!(ruby.lines[0].text, "やまだ");
    // 3 chars × 8pt = 24pt centered over the 40pt base run at cell 3
    // (x 60): 60 + (40 - 24) / 2.
    assert_eq!(ruby.lines[0].x, 68.0);
}
