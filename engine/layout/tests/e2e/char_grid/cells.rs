//! Horizontal cell placement: positions, wrapping, kinsoku, grid rects.

use super::{grid_rects, grid_template, main_block};
use crate::common::*;

#[test]
fn cells_center_chars_and_stroke_the_grid() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: ああ\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let page = &doc.pages[0];
    // Two 20pt stroked cells at x 0 / 20, default 0.5pt black grid.
    let rects = grid_rects(page);
    assert_eq!(rects.len(), 2);
    assert_eq!(
        (rects[0].x, rects[0].y, rects[0].w, rects[0].h),
        (0.0, 0.0, 20.0, 20.0)
    );
    assert_eq!(rects[1].x, 20.0);
    assert_eq!(rects[0].stroke_width, 0.5);
    assert_eq!(rects[0].stroke, Some((0.0, 0.0, 0.0)));
    // Chars center in their cells: 10pt full-width glyph in a 20pt cell.
    let block = main_block(page);
    assert_eq!(block.lines.len(), 2);
    assert_eq!((block.lines[0].x, block.lines[0].y), (5.0, 5.0));
    assert_eq!((block.lines[1].x, block.lines[1].y), (25.0, 5.0));
}

#[test]
fn wraps_at_chars_per_line_and_honors_gaps() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あいう\n        grid: { charsPerLine: 2, lines: 2, cellSize: 20, charGap: 2, lineGap: 6 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    // い sits one cell + charGap right; う wraps to the next line below
    // cell + lineGap.
    assert_eq!(block.lines[1].x, 22.0 + 5.0);
    assert_eq!(block.lines[2].x, 5.0);
    assert_eq!(block.lines[2].y, 26.0 + 5.0);
}

#[test]
fn newline_breaks_the_line() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: \"あ\\nい\"\n        grid: { charsPerLine: 3, lines: 2, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    assert_eq!(block.lines[1].y, 25.0);
    assert_eq!(block.lines[1].x, 5.0);
}

#[test]
fn school_kinsoku_hangs_punctuation_into_the_last_cell() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あいう。え\n        grid: { charsPerLine: 3, lines: 2, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    // 。 shares う's cell (index 2), shifted half a cell right.
    let maru = &block.lines[3];
    assert_eq!(maru.text, "。");
    assert_eq!(maru.x, 40.0 + 5.0 + 10.0);
    assert_eq!(maru.y, 5.0);
    // え starts the next line.
    assert_eq!((block.lines[4].x, block.lines[4].y), (5.0, 25.0));
}

#[test]
fn kinsoku_none_fills_strictly() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あいう。\n        grid: { charsPerLine: 3, lines: 2, cellSize: 20 }\n        kinsoku: none\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    assert_eq!(block.lines[3].text, "。");
    assert_eq!((block.lines[3].x, block.lines[3].y), (5.0, 25.0));
}

#[test]
fn derived_cell_size_splits_the_content_width() {
    let yaml = grid_template(
        100.0,
        200.0,
        "        text: あ\n        grid: { charsPerLine: 4, lines: 1 }\n",
    );
    let (doc, _) = run(&yaml, json!({}));
    let rects = grid_rects(&doc.pages[0]);
    assert_eq!(rects.len(), 4);
    assert_eq!(rects[0].w, 25.0);
    assert_eq!(rects[3].x, 75.0);
}

#[test]
fn font_size_defaults_to_seventy_percent_of_the_cell() {
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: char_grid\n        text: あ\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n";
    let (doc, _) = run(yaml, json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.font_size, 14.0);
}

#[test]
fn authored_border_and_colors_apply_to_the_grid() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n        text: あ\n        styleNames: [genko]\n",
    )
    .replace(
        "sections:",
        "styles:\n  genko: { borderWidth: 1.5, borderColor: \"#00ff00\", backgroundColor: \"#0000ff\", color: \"#ff0000\" }\nsections:",
    );
    let (doc, _) = run(&yaml, json!({}));
    let page = &doc.pages[0];
    let rects = grid_rects(page);
    assert_eq!(rects[0].stroke_width, 1.5);
    assert_eq!(rects[0].stroke, Some((0.0, 1.0, 0.0)));
    // The background fill covers the grid extent under the cells.
    let fill = rect_shapes(page)
        .into_iter()
        .find(|r| r.fill.is_some())
        .expect("background fill");
    assert_eq!((fill.w, fill.h), (40.0, 20.0));
    assert_eq!(main_block(page).color, (1.0, 0.0, 0.0));
}

#[test]
fn border_width_zero_turns_the_grid_off() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あ\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n",
    )
    .replace("fontSize: 10 }", "fontSize: 10, borderWidth: 0 }");
    let (doc, _) = run(&yaml, json!({}));
    assert!(grid_rects(&doc.pages[0]).is_empty());
}

#[test]
fn bold_and_italic_resolve_variant_faces_or_synthetics() {
    // biz-ud-gothic has a real bold face (no italic): bold must NOT be
    // synthetic, italic must be.
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: あ\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n",
    )
    .replace(
        "fontSize: 10 }",
        "fontSize: 10, fontWeight: bold, fontStyle: italic }",
    );
    let (doc, _) = run(&yaml, json!({}));
    let block = main_block(&doc.pages[0]);
    assert!(!block.synthetic_bold);
    assert!(block.synthetic_italic);
}

#[test]
fn unmappable_chars_warn_missing_glyph_once() {
    // U+13000 (Egyptian hieroglyph) is in neither BIZ UD nor IPAmj.
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: \"\u{13000}あ\"\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    let hits = diags.iter().filter(|d| d.code == "missing_glyph").count();
    assert_eq!(hits, 1);
}

#[test]
fn named_style_font_size_and_inline_border_both_apply() {
    // fontSize from the registry, borderWidth inline: both authored
    // channels reach the grid.
    let yaml = "styles:\n  manuscript: { fontSize: 12 }\npage:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: char_grid\n        text: あ\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n        styleNames: [manuscript]\n        style: { borderWidth: 2 }\n";
    let (doc, _) = run(yaml, json!({}));
    let page = &doc.pages[0];
    assert!(text_blocks(page).iter().any(|b| b.font_size == 12.0));
    assert_eq!(grid_rects(page)[0].stroke_width, 2.0);
}

#[test]
fn per_side_border_width_uses_the_top_side_for_the_grid() {
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: char_grid\n        text: あ\n        grid: { charsPerLine: 2, lines: 1, cellSize: 20 }\n        style: { borderWidth: { top: 2, bottom: 1 } }\n";
    let (doc, _) = run(yaml, json!({}));
    assert_eq!(grid_rects(&doc.pages[0])[0].stroke_width, 2.0);
}

#[test]
fn data_binding_and_interpolation_fill_cells() {
    let yaml = grid_template(
        200.0,
        200.0,
        "        text: \"題{title}\"\n        grid: { charsPerLine: 4, lines: 1, cellSize: 20 }\n",
    );
    let (doc, _) = run(&yaml, json!({"title": "吾輩"}));
    let block = main_block(&doc.pages[0]);
    assert_eq!(line_texts(block), vec!["題", "吾", "輩"]);
}
