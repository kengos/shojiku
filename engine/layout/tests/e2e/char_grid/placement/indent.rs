//! `［＃Ｎ字下げ］`: the source line's first physical line starts N cells
//! in; a wrapped continuation resumes at the line head. `cellSize` equals
//! the 10pt font so a glyph fills its cell and `x` is the cell origin.

use super::super::main_block;
use super::{cell_x, placed};
use crate::common::*;

#[test]
fn an_indent_offsets_the_first_line() {
    // 2字下げ on a 10pt-cell grid: 題 sits at cell 2 → x = 20.
    let yaml = placed(
        "［＃２字下げ］題名",
        "{ charsPerLine: 8, lines: 2, cellSize: 10 }",
        None,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "ruby_markup_invalid"));
    assert_eq!(cell_x(&doc.pages[0], '題'), 20.0);
}

#[test]
fn a_wrapped_indent_line_continues_at_the_line_head() {
    // The first physical line is indented; the wrap starts at cell 0.
    let yaml = placed(
        "［＃２字下げ］あいうえ",
        "{ charsPerLine: 3, lines: 3, cellSize: 10 }",
        None,
    );
    let (doc, _) = run(&yaml, json!({}));
    let page = &doc.pages[0];
    // あ indented to cell 2 (x 20); the wrap resumes at the line head, so
    // い (the first continuation char) sits at cell 0 (x 0).
    assert_eq!(cell_x(page, 'あ'), 20.0);
    assert_eq!(cell_x(page, 'い'), 0.0);
}

#[test]
fn an_oversized_indent_is_clamped_and_warns() {
    let yaml = placed(
        "［＃９字下げ］字",
        "{ charsPerLine: 3, lines: 2, cellSize: 10 }",
        None,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "char_grid_markup_clamped"));
    // Clamped to the last cell (cell 2, x 20).
    assert_eq!(cell_x(&doc.pages[0], '字'), 20.0);
}

#[test]
fn the_grid_stays_complete_under_an_indent() {
    let yaml = placed(
        "［＃２字下げ］題",
        "{ charsPerLine: 4, lines: 2, cellSize: 10 }",
        None,
    );
    let (doc, _) = run(&yaml, json!({}));
    // 4×2 = 8 マス目 regardless of the indent.
    assert_eq!(super::super::grid_rects(&doc.pages[0]).len(), 8);
    // Sanity: the base block exists.
    assert!(!main_block(&doc.pages[0]).lines.is_empty());
}
