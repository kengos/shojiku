//! Vertical `textSpacingTrim` (約物半角): fullwidth punctuation cells
//! trim to half-em down the column — adjacent pairs under `normal`, plus
//! the column-head opening bracket under `trim_start` — and every extent
//! (measure == draw) reflects it. Fixed-pitch `biz-ud-gothic` keeps each
//! untrimmed cell exactly 10pt.

use super::tmpl;
use super::valign::count_code;
use crate::common::*;

#[test]
fn adjacent_punctuation_trims_to_half_em() {
    // あ」、「い: 」 and 、 abut punctuation (−5pt each) and 「 follows one
    // (−5pt, sliding up) → the 50pt column measures 35pt.
    let (doc, diags) = run(
        &tmpl("あ」、「い", "w: 200, h: 100", ", textSpacingTrim: normal"),
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_style_ignored"), 0);
    let block = text_blocks(&doc.pages[0])[0];
    assert!(
        (block.lines[0].width - 35.0).abs() < 0.5,
        "{}",
        block.lines[0].width
    );

    let (plain, _d) = run(&tmpl("あ」、「い", "w: 200, h: 100", ""), json!({}));
    let untrimmed = text_blocks(&plain.pages[0])[0].lines[0].width;
    assert!((untrimmed - 50.0).abs() < 0.5, "{untrimmed}");
}

#[test]
fn trim_start_pulls_the_column_head_bracket_up() {
    let (doc, _d) = run(
        &tmpl("「あい", "w: 200, h: 100", ", textSpacingTrim: trim_start"),
        json!({}),
    );
    let head = text_blocks(&doc.pages[0])[0].lines[0].width;
    assert!((head - 25.0).abs() < 0.5, "{head}");
    // `normal` keeps the head space (interior pairs only).
    let (doc, _d) = run(
        &tmpl("「あい", "w: 200, h: 100", ", textSpacingTrim: normal"),
        json!({}),
    );
    let normal = text_blocks(&doc.pages[0])[0].lines[0].width;
    assert!((normal - 30.0).abs() < 0.5, "{normal}");
}

#[test]
fn a_trimmed_vertical_table_cell_measures_like_it_draws() {
    // An auto table row over a trimmed vertical cell: the measured row
    // height is the TRIMMED extent (+ padding), so the render pass never
    // re-wraps.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - label: v
            data: { key: v }
            width: 40
            style: { writingMode: vertical_rl, fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, textSpacingTrim: normal }
"#,
        json!({ "rows": [ { "v": "あ」、い" } ] }),
    );
    assert!(!diags.has_errors());
    // The row measures UNTRIMMED (the wrap-estimate upper bound, so the
    // render pass never re-wraps): one whole column, whose drawn ink is
    // the trimmed extent — only 」 abuts following punctuation (、), so
    // one −5pt trim → 35pt of ink in the 40pt row basis.
    let block = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.vertical.is_some())
        .expect("vertical cell block");
    assert_eq!(block.lines.len(), 1, "the measured row never re-wraps");
    assert!(
        (block.lines[0].width - 35.0).abs() < 0.5,
        "{}",
        block.lines[0].width
    );
}

#[test]
fn hostile_letter_spacing_on_a_trimmed_column_never_panics() {
    // −1000pt (the admitted magnitude cap) dwarfs every advance; the trim
    // deltas floor at zero and the block still builds.
    let (doc, _diags) = run(
        &tmpl(
            "あ」、「い",
            "w: 200, h: 100",
            ", textSpacingTrim: normal, letterSpacing: -1000",
        ),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1);
}
