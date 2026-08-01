//! Vertical (縦書き) list end to end (`src/engine/list/vertical.rs`): each
//! array entry is a right-to-left column. `box.w` caps how many columns
//! fit (excess entries collapse into a leftmost `+{count}` column); a
//! definite `box.h` down-clamps an over-long entry with a trailing `…`.
//! Fixed-pitch `biz-ud-gothic` (10pt, lineHeight 1.0) makes every column
//! 10pt wide and every upright cell 10pt down, so geometry is exact.

use crate::common::*;
use shojiku_core::TextOrientation;

/// A vertical list of string entries. `box_kv` is the box map body,
/// `style_extra` appends to the style.
fn tmpl(box_kv: &str, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: list
        data: {{ key: rows }}
        box: {{ {box_kv} }}
        style: {{ fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl{style_extra} }}
"#
    )
}

#[test]
fn entries_become_right_to_left_columns() {
    let (doc, diags) = run(
        &tmpl("x: 0, y: 0, w: 200, h: 100", ""),
        json!({ "rows": ["あ", "い", "う"] }),
    );
    assert!(!diags.has_errors());
    // No `vertical_text_unsupported` — the list renders vertically now.
    assert!(diags.iter().all(|d| d.code != "vertical_text_unsupported"));
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.vertical, Some(TextOrientation::Mixed));
    // One column per entry; the first entry sits at the box's right edge.
    assert_eq!(block.lines.len(), 3);
    assert_eq!(block.lines[0].text, "あ");
    assert!(
        (block.lines[0].x - 190.0).abs() < 0.01,
        "{:?}",
        block.lines[0].x
    );
    // Columns step left one width (10pt) per entry.
    assert!((block.lines[0].x - block.lines[1].x - 10.0).abs() < 0.01);
}

#[test]
fn box_width_caps_columns_with_a_leftmost_overflow_count() {
    // A 30pt-wide box fits three 10pt columns; with four entries the list
    // keeps two and adds a `+2` overflow column at the far left.
    let (doc, _d) = run(
        &tmpl("x: 0, y: 0, w: 30, h: 100", ""),
        json!({ "rows": ["あ", "い", "う", "え"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 3);
    let last = block.lines.last().unwrap();
    assert!(last.text.contains('2'), "overflow text: {:?}", last.text);
    // The overflow column is the leftmost (smallest x).
    let min_x = block.lines.iter().map(|l| l.x).fold(f64::MAX, f64::min);
    assert!((last.x - min_x).abs() < 0.01);
}

#[test]
fn a_long_entry_clamps_down_with_an_ellipsis() {
    // A 30pt-tall box fits ~2 cells plus the `…`; a five-cell entry is
    // clamped with a trailing ellipsis.
    let (doc, _d) = run(
        &tmpl("x: 0, y: 0, w: 200, h: 30", ""),
        json!({ "rows": ["あいうえお"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert!(
        block.lines[0].text.ends_with('…'),
        "clamped: {:?}",
        block.lines[0].text
    );
    assert!(block.lines[0].text.chars().count() < "あいうえお".chars().count() + 1);
}

#[test]
fn a_clamp_never_ends_on_an_opening_bracket() {
    // The fitting prefix ends on `「` (行末禁則: never a column end); it is
    // dropped before the `…`, so the clamp reads "あ…", not "あ「…".
    let (doc, _d) = run(
        &tmpl("x: 0, y: 0, w: 200, h: 30", ""),
        json!({ "rows": ["あ「うえお"] }),
    );
    let text = &text_blocks(&doc.pages[0])[0].lines[0].text;
    assert_eq!(text, "あ…", "clamped: {text:?}");
}

#[test]
fn auto_height_grows_to_the_longest_column() {
    // No box.h → the block is as tall as the longest entry (three 10pt
    // cells = 30pt); no clamp happens.
    let (doc, _d) = run(
        &tmpl("x: 0, y: 0, w: 200", ""),
        json!({ "rows": ["あ", "いうえ"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    // The longest column has full extent; nothing is clamped.
    assert!(block.lines.iter().all(|l| !l.text.ends_with('…')));
    let max_extent = block.lines.iter().map(|l| l.width).fold(0.0, f64::max);
    assert!((max_extent - 30.0).abs() < 0.01, "{max_extent:?}");
}

#[test]
fn text_align_right_bottoms_a_short_column() {
    // A one-cell entry (10pt) in a 100pt box, textAlign right → the column
    // starts 90pt down (bottom of its length).
    let (doc, _d) = run(
        &tmpl("x: 0, y: 0, w: 200, h: 100", ", textAlign: right"),
        json!({ "rows": ["あ"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert!(
        (block.lines[0].y - 90.0).abs() < 0.01,
        "{:?}",
        block.lines[0].y
    );
}

#[test]
fn the_entry_cap_bounds_columns() {
    // A very wide box would fit thousands of columns, but MAX_LIST_ENTRIES
    // (1000) caps the rendered set; the rest collapse into `+{count}`.
    let rows: Vec<String> = (0..1100).map(|_| "x".to_string()).collect();
    let (doc, _d) = run(
        &tmpl("x: 0, y: 0, w: 20000, h: 100", ""),
        json!({ "rows": rows }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    // 1000 kept + one overflow column.
    assert_eq!(block.lines.len(), 1001);
    assert!(block.lines.last().unwrap().text.contains("100"));
}

#[test]
fn a_custom_overflow_template_fills_the_count() {
    // A 30pt box fits three columns; five entries keep two and the custom
    // `overflowText` renders the cut count in the leftmost column.
    let (doc, _d) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: list
        data: { key: rows }
        overflowText: "他{count}件"
        box: { x: 0, y: 0, w: 30, h: 100 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl }
"#,
        json!({ "rows": ["あ", "い", "う", "え", "お"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    let last = block.lines.last().unwrap();
    assert!(last.text.contains("他3件"), "overflow: {:?}", last.text);
}

#[test]
fn text_decoration_draws_a_side_band_per_column() {
    // The vertical list mirrors the horizontal list's per-line decoration
    // rect: one side band per column, and no `vertical_style_ignored`.
    let (doc, diags) = run(
        &tmpl("x: 0, y: 0, w: 200, h: 100", ", textDecoration: underline"),
        json!({ "rows": ["あい", "うえ"] }),
    );
    assert!(diags.iter().all(|d| d.code != "vertical_style_ignored"));
    let block = text_blocks(&doc.pages[0])[0];
    let d = block.decoration.expect("side band");
    // Band left edge = col_w/2 (5) + em/2 (5), right of the em cell.
    assert!((d.offset - 10.0).abs() < 1e-9, "{d:?}");
}
