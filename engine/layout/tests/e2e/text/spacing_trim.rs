//! `textSpacingTrim` (約物半角) end to end (`src/style/enums.rs` →
//! `src/style.rs` cascade → `src/font/shape/trim.rs` → tree/renderers).
//! Fixed-pitch `biz-ud-gothic` so every fullwidth glyph is exactly 1em
//! (10pt): an untrimmed punctuation advances 10pt, a trimmed one 5pt.

use crate::common::*;
use shojiku_core::TextSpacingTrim;

/// One flow text item with a selectable `textSpacingTrim`.
fn tmpl(trim: &str, text: &str, extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        text: "{text}"
        box: {{ w: 200 }}
        style: {{ fontSize: 10, fontFamily: biz-ud-gothic, textSpacingTrim: {trim}{extra} }}
"#
    )
}

fn line_width(doc: &LayoutDocument) -> f64 {
    text_blocks(&doc.pages[0])[0].lines[0].width
}

#[test]
fn space_all_is_the_default_and_trims_nothing() {
    // A closing + opening bracket pair: 2em untrimmed.
    let (doc, diags) = run(&tmpl("space_all", "」「", ""), json!({}));
    assert!(!diags.has_errors());
    assert!((line_width(&doc) - 20.0).abs() < 0.01);
    assert_eq!(
        text_blocks(&doc.pages[0])[0].text_spacing_trim,
        TextSpacingTrim::SpaceAll
    );
}

#[test]
fn normal_trims_an_adjacent_bracket_pair_to_half_each() {
    // 」(right space dropped) + 「(left space dropped) = 0.5em + 0.5em.
    let (doc, diags) = run(&tmpl("normal", "」「", ""), json!({}));
    assert!(!diags.has_errors());
    assert!(
        (line_width(&doc) - 10.0).abs() < 0.01,
        "got {}",
        line_width(&doc)
    );
    assert_eq!(
        text_blocks(&doc.pages[0])[0].text_spacing_trim,
        TextSpacingTrim::Normal
    );
}

#[test]
fn normal_leaves_a_line_head_bracket_but_trim_start_trims_it() {
    // "「あ": under `normal` the opening bracket keeps its (line-head)
    // leading space (2em); under `trim_start` it is trimmed (1.5em).
    let (normal, dn) = run(&tmpl("normal", "「あ", ""), json!({}));
    let (start, ds) = run(&tmpl("trim_start", "「あ", ""), json!({}));
    assert!(!dn.has_errors() && !ds.has_errors());
    assert!((line_width(&normal) - 20.0).abs() < 0.01);
    assert!(
        (line_width(&start) - 15.0).abs() < 0.01,
        "got {}",
        line_width(&start)
    );
}

#[test]
fn trimming_narrows_the_right_aligned_start() {
    // Right alignment uses the trimmed width, so the line starts further
    // right. Box 200 wide: untrimmed 」「 = 20 → x 180; trimmed = 10 → x 190.
    let (plain, _) = run(&tmpl("space_all", "」「", ", textAlign: right"), json!({}));
    let (trimmed, _) = run(&tmpl("normal", "」「", ", textAlign: right"), json!({}));
    let px = text_blocks(&plain.pages[0])[0].lines[0].x;
    let tx = text_blocks(&trimmed.pages[0])[0].lines[0].x;
    assert!((px - 180.0).abs() < 0.01, "got {px}");
    assert!((tx - 190.0).abs() < 0.01, "got {tx}");
}

#[test]
fn text_spacing_trim_inherits_from_defaults_style() {
    // Set on the document root style; a plain text item inherits it.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
defaults:
  style: { fontFamily: biz-ud-gothic, textSpacingTrim: normal }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        text: "」「"
        box: { w: 200 }
        style: { fontSize: 10 }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    assert!((line_width(&doc) - 10.0).abs() < 0.01);
}
