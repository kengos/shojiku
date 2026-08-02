//! `textDecoration` on vertical text: a SIDE band per column — underline
//! just right of the em cell (the JLREQ 傍線 convention), line-through on
//! the column axis — carried as the tree's vertical `DecorationSpec`
//! reading (offset = from the column left to the band's left edge).

use super::tmpl;
use super::valign::count_code;
use crate::common::*;

#[test]
fn underline_bands_sit_right_of_the_em_cell() {
    let (doc, diags) = run(
        &tmpl("あいう", "w: 200, h: 100", ", textDecoration: underline"),
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_style_ignored"), 0);
    let block = text_blocks(&doc.pages[0])[0];
    let d = block.decoration.expect("side band");
    // col_w 10 (axis at 5) + half the 10pt em = the band starts at the em
    // cell's right edge.
    assert!((d.offset - 10.0).abs() < 1e-9, "{d:?}");
    assert!(d.thickness > 0.0);
}

#[test]
fn line_through_rides_the_column_axis() {
    let (doc, _d) = run(
        &tmpl("あいう", "w: 200, h: 100", ", textDecoration: line_through"),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    let d = block.decoration.expect("side band");
    // Band center = offset + thickness/2 = the column axis (col_w / 2).
    assert!((d.offset + d.thickness / 2.0 - 5.0).abs() < 1e-9, "{d:?}");
}

#[test]
fn rich_spans_carry_the_band_per_run() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        box: { w: 200, h: 100 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl }
        spans:
          - { text: "あい", style: { textDecoration: underline } }
          - { text: "うえ" }
"#,
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_style_ignored"), 0);
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.decoration.is_none(), "rich decoration is per run");
    let runs = &block.lines[0].runs;
    assert!(runs[0].decoration.is_some());
    assert!(runs[1].decoration.is_none());
}
