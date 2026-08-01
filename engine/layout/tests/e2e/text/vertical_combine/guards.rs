//! 縦中横 guards: the knob is inert on horizontal blocks and rich spans
//! (v1), silently — it is an inherited style property, so an ancestor's
//! value must never warn on children that don't use it.

use super::tmpl;
use crate::common::*;

#[test]
fn a_horizontal_block_ignores_the_knob_silently() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "12あ"
        box: { w: 100 }
        style: { fontSize: 10, fontFamily: biz-ud-gothic, textCombineUpright: { digits: 2 } }
"#;
    let (doc, diags) = run(yaml, json!({}));
    assert!(diags.iter().next().is_none(), "no warns: {diags:?}");
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.vertical, None);
    assert_eq!(block.text_combine, None);
}

#[test]
fn vertical_rich_spans_stay_uncombined_in_v1() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        box: { w: 200, h: 100 }
        spans:
          - text: "あ12"
        style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl, textCombineUpright: { digits: 2 } }
"#;
    let (doc, _) = run(yaml, json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.vertical.is_some());
    assert_eq!(block.text_combine, None);
}

#[test]
fn a_degenerate_all_zero_group_keeps_scale_one() {
    // Hostile-ish input the scale guard covers: grouping still applies
    // (the cells exist), the block still renders warning-free.
    let (doc, diags) = run(
        &tmpl("00", ", textCombineUpright: { digits: 2 }"),
        json!({}),
    );
    assert!(!diags.has_errors());
    assert!((text_blocks(&doc.pages[0])[0].lines[0].width - 10.0).abs() < 0.01);
}

#[test]
fn combine_is_inert_in_horizontal_text() {
    // The same digits knob on a horizontal block changes nothing: three
    // halfwidth digits stay 15pt (combined would be one 10pt cell).
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "123"
        box: { w: 200 }
        style: { fontSize: 10, fontFamily: biz-ud-gothic, textCombineUpright: { digits: 3 } }
"#;
    let (doc, diags) = run(yaml, json!({}));
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.text_combine, None, "horizontal blocks never combine");
    assert!(
        (block.lines[0].width - 15.0).abs() < 0.01,
        "width {}",
        block.lines[0].width
    );
}

#[test]
fn combine_degrades_sanely_under_hostile_style_values() {
    // A negative fontSize falls back with `invalid_font_size`; the
    // combined arrangement still terminates on the fallback size.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "あ12い"
        box: { w: 200, h: 100 }
        style: { fontSize: -5, letterSpacing: 5000, fontFamily: biz-ud-gothic, writingMode: vertical_rl, textCombineUpright: { digits: 2 } }
"#;
    let (doc, diags) = run(yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "invalid_font_size"));
    assert!(diags.iter().any(|d| d.code == "invalid_letter_spacing"));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.lines.iter().all(|l| l.width.is_finite()));
}
