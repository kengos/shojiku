//! Text blocks end to end: wrapping/kinsoku, align, valign,
//! hostile metrics, and text diagnostics.

use crate::common::*;

mod decoration;
mod glyphs;
mod hanging;
mod line_break;
mod overflow;
mod paginate;
mod placeholder;
mod rich;
mod ruby;
mod shaping;
mod spacing_trim;
mod variants;
mod vertical;
mod vertical_combine;
mod vertical_degrade;
mod vertical_knobs;
mod vertical_paginate;
mod vertical_rich;
mod vertical_ruby;

// At fontSize 10 a full-width char is 10pt, so `box.w: 25` fits two per
// line. "ああ。あ" wraps to ["ああ", "。あ"] before kinsoku, then kinsoku
// pulls the `。` off the second line's head to ["あ", "あ。あ"].
#[test]
fn kinsoku_on_by_default() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        text: "ああ。あ"
        box: { w: 25 }
        style: { fontSize: 10 }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(line_texts(blocks[0]), vec!["あ", "あ。あ"]);
}

#[test]
fn align_right_and_center_shift_lines() {
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: xx
        style: { textAlign: left }
      - type: text
        text: xx
        style: { textAlign: center }
      - type: text
        text: xx
        style: { textAlign: right }
"#,
        json!({}),
    );
    let xs: Vec<f64> = text_blocks(&doc.pages[0])
        .iter()
        .map(|t| t.lines[0].x)
        .collect();
    assert_eq!(xs.len(), 3);
    assert!(
        xs[0] < xs[1] && xs[1] < xs[2],
        "expected left < center < right: {xs:?}"
    );
    assert_eq!(xs[0], 0.0);
}

#[test]
fn valign_middle_offsets_text() {
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: hi
        box: { h: 100 }
        style: { fontSize: 10, lineHeight: 1.0, verticalAlign: middle }
"#,
        json!({}),
    );
    let texts = text_blocks(&doc.pages[0]);
    // (100 - 10) / 2 = 45
    let delta = (texts[0].lines[0].y - 45.0).abs();
    assert!(delta < 0.01);
}

#[test]
fn hostile_font_metrics_are_sanitized() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: guarded
        style: { fontSize: -5, lineHeight: 0 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_font_size"));
    assert!(diags.iter().any(|d| d.code == "invalid_line_height"));
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].font_size, 10.0);
    assert!((texts[0].line_height - 14.0).abs() < 0.001);
}

#[test]
fn letter_spacing_reaches_the_tree_and_alignment() {
    // Two right-aligned runs of the same text: spacing widens the line,
    // so its right-aligned start moves left by n × spacing.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: "ああ"
        style: { fontSize: 10, textAlign: right, fontFamily: biz-ud-gothic }
      - type: text
        text: "ああ"
        style: { fontSize: 10, textAlign: right, letterSpacing: 5, fontFamily: biz-ud-gothic }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].letter_spacing, 0.0);
    assert_eq!(texts[1].letter_spacing, 5.0);
    // Fixed-pitch face → each あ is exactly 1em (10pt).
    // Plain: 400 - 20 = 380. Spaced: 400 - (20 + 2×5) = 370.
    assert!((texts[0].lines[0].x - 380.0).abs() < 0.01);
    assert!((texts[1].lines[0].x - 370.0).abs() < 0.01);
    // Plain text carries no synthetic variant flags.
    assert!(!texts[0].synthetic_bold);
    assert!(!texts[0].synthetic_italic);
}

#[test]
fn font_weight_and_style_set_the_synthetic_flags() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: 強調
        style: { fontFamily: ipamj-mincho, fontWeight: bold, fontStyle: italic }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let texts = text_blocks(&doc.pages[0]);
    // ipamj-mincho has neither a bold nor an italic face, so both stay
    // synthetic (unlike the default biz-udp, which has a real bold).
    assert!(texts[0].synthetic_bold);
    assert!(texts[0].synthetic_italic);
    // The synthetic-bold stroke width scales with the computed font size
    // (default 10pt here).
    assert!((texts[0].synthetic_bold_stroke_width() - 0.3).abs() < 1e-9);
}

#[test]
fn huge_letter_spacing_warns_and_falls_back_to_zero() {
    // The magnitude cap: a hostile spacing would multiply by content
    // length into non-finite widths, so it drops to 0 with a diagnostic.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: guarded
        style: { letterSpacing: 99999 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_letter_spacing"));
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].letter_spacing, 0.0);
}

#[test]
fn missing_data_warns_and_renders_empty() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        data: { key: nothing.here }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "missing_data"));
    assert_eq!(all_text(&doc.pages[0]), "");
}

#[test]
fn text_item_without_content_warns() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "empty_text_item"));
    assert_eq!(all_text(&doc.pages[0]), "");
}

#[test]
fn valign_bottom_pushes_text_down() {
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: hi
        box: { h: 100 }
        style: { fontSize: 10, lineHeight: 1.0, verticalAlign: bottom }
"#,
        json!({}),
    );
    let texts = text_blocks(&doc.pages[0]);
    let delta = (texts[0].lines[0].y - 90.0).abs();
    assert!(delta < 0.01);
}
