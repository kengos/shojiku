//! 縦中横 measurement: a combined group is exactly one 1em cell of the
//! column, and grouping follows the CSS `digits` rule.

use super::tmpl;
use crate::common::*;

#[test]
fn a_three_digit_group_measures_one_cell() {
    // あ(10) + "111" + い(10): uncombined the three halfwidth digits are
    // 15pt of rotated cells; combined they are ONE 10pt cell.
    let (with, _) = run(
        &tmpl("あ111い", ", textCombineUpright: { digits: 3 }"),
        json!({}),
    );
    let (without, _) = run(&tmpl("あ111い", ""), json!({}));
    let w_with = text_blocks(&with.pages[0])[0].lines[0].width;
    let w_without = text_blocks(&without.pages[0])[0].lines[0].width;
    assert!((w_with - 30.0).abs() < 0.01, "got {w_with}");
    // Uncombined, the three rotated digits exceed the one 10pt cell.
    assert!(w_without > w_with + 0.5, "got {w_without} vs {w_with}");
}

#[test]
fn a_run_longer_than_the_knob_stays_uncombined() {
    let (doc, _) = run(
        &tmpl("1234", ", textCombineUpright: { digits: 3 }"),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    let (plain, _) = run(&tmpl("1234", ""), json!({}));
    let per_char = text_blocks(&plain.pages[0])[0].lines[0].width;
    // The CSS rule: no suffix of an over-long run re-combines — the
    // extent equals the knob-less per-char run exactly.
    assert!((block.lines[0].width - per_char).abs() < 0.01);
}

#[test]
fn a_group_wraps_whole_to_the_next_column() {
    // 25pt columns: あい fills 20, the 10pt combined cell starts the
    // next column with う.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "あい12う"
        box: { w: 200, h: 25 }
        style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl, textCombineUpright: { digits: 2 } }
"#;
    let (doc, _) = run(yaml, json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    let texts = line_texts(block);
    assert_eq!(texts, vec!["あい", "12う"]);
}

#[test]
fn the_knob_inherits_through_a_container() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: container
        box: { w: 300, h: 120 }
        style: { textCombineUpright: { digits: 2 } }
        items:
          - type: text
            text: "12あ"
            box: { x: 0, y: 0, w: 100, h: 100 }
            style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
"#;
    let (doc, diags) = run(yaml, json!({}));
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(
        block.text_combine,
        Some(shojiku_core::TextCombine::Digits(2))
    );
    // "12" one cell + あ = 20pt of column extent.
    assert!((block.lines[0].width - 20.0).abs() < 0.01);
}

#[test]
fn an_authored_none_overrides_the_inherited_knob() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: container
        box: { w: 300, h: 120 }
        style: { textCombineUpright: { digits: 2 } }
        items:
          - type: text
            text: "12あ"
            box: { x: 0, y: 0, w: 100, h: 100 }
            style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl, textCombineUpright: none }
"#;
    let (doc, _) = run(yaml, json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.text_combine, None);
}
