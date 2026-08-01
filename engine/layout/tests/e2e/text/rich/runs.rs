//! Rich-span run output: the shared baseline grid, alignment by
//! summed run widths, per-span style layering, real-variant selection,
//! and decoration propagation.

use super::fixed_ascent;
use crate::common::*;

#[test]
fn spans_form_runs_on_a_shared_baseline_grid() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        style: { fontFamily: biz-ud-gothic, fontSize: 10 }
        spans:
          - text: "ああ"
          - text: "あ"
            style: { fontSize: 20, color: '#ff0000' }
"##,
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    // Uniform grid: the largest span size drives one line height and one
    // baseline (the deepest ascent) for the whole block.
    assert!((block.line_height - 20.0 * 1.4).abs() < 1e-6);
    assert_eq!(block.baseline, Some(fixed_ascent(20.0)));
    let line = &block.lines[0];
    assert_eq!(line.text, "あああ");
    // Two runs, adjacent, carrying their authoring span index and style.
    assert_eq!(line.runs.len(), 2);
    let (a, b) = (&line.runs[0], &line.runs[1]);
    assert_eq!((a.span, b.span), (0, 1));
    assert_eq!(a.text, "ああ");
    assert_eq!(b.text, "あ");
    assert!((a.width - 20.0).abs() < 1e-6); // 2 chars × 1em @ 10pt
    assert!((b.width - 20.0).abs() < 1e-6); // 1 char × 1em @ 20pt
    assert!((b.x - (a.x + a.width)).abs() < 1e-6);
    assert_eq!(a.font_size, 10.0);
    assert_eq!(b.font_size, 20.0);
    assert_eq!(b.color, (1.0, 0.0, 0.0));
    // The line width is the run sum (drives alignment/decoration).
    assert!((line.width - 40.0).abs() < 1e-6);
    // The ja pack's fallback chain rides every run.
    assert!(!a.fallback_ids.is_empty());
}

#[test]
fn align_right_positions_by_summed_run_width() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 500 }
    items:
      - type: text
        style: { fontFamily: biz-ud-gothic, fontSize: 10, textAlign: right }
        spans:
          - text: "ああ"
          - text: "あ"
"#,
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    let line = &block.lines[0];
    // 3 full-width chars = 30pt, right-aligned in 100pt.
    assert!((line.x - 70.0).abs() < 1e-6);
    assert!((line.runs[0].x - 70.0).abs() < 1e-6);
    assert!((line.runs[1].x - 90.0).abs() < 1e-6);
}

#[test]
fn span_styles_layer_named_then_inline_over_the_block() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
styles:
  loud: { fontWeight: bold, color: '#00ff00' }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        style: { fontFamily: biz-ud-gothic, fontSize: 10, letterSpacing: 2 }
        spans:
          - text: "aa"
          - text: "bb"
            styleNames: [loud]
            style: { color: '#0000ff' }
"##,
        json!({}),
    );
    assert!(!diags.has_errors());
    let line = &text_blocks(&doc.pages[0])[0].lines[0];
    // Span 0 inherits the block's letterSpacing; span 1 layers the named
    // bold — the family has a REAL bold face, so variant selection picks
    // it and no synthetic emboldening applies — then the inline color.
    assert_eq!(line.runs[0].letter_spacing, 2.0);
    assert_eq!(line.runs[0].font_id, "biz-ud-gothic");
    assert_eq!(line.runs[1].font_id, "biz-ud-gothic-bold");
    assert!(!line.runs[1].synthetic_bold);
    assert_eq!(line.runs[1].color, (0.0, 0.0, 1.0));
}

#[test]
fn bold_span_picks_a_real_variant_face_when_available() {
    let (doc, _) = run_with_fonts(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        spans:
          - text: "aa"
          - text: "bb"
            style: { fontWeight: bold }
"#,
        json!({}),
        &variant_font_store(),
    );
    let line = &text_blocks(&doc.pages[0])[0].lines[0];
    assert_eq!(line.runs[0].font_id, "sans-regular");
    assert_eq!(line.runs[1].font_id, "sans-bold");
    // A real bold face: no synthetic emboldening.
    assert!(!line.runs[1].synthetic_bold);
}

#[test]
fn block_decoration_propagates_and_spans_override() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        style: { fontFamily: biz-ud-gothic, textDecoration: underline }
        spans:
          - text: "ああ"
          - text: "あ"
            style: { textDecoration: none }
"#,
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    // Rich decoration lives on the runs, not the block.
    assert!(block.decoration.is_none());
    let line = &block.lines[0];
    let deco = line.runs[0].decoration.expect("propagated underline");
    assert!(deco.thickness > 0.0);
    // Underline sits below the shared baseline.
    assert!(deco.offset > block.baseline.unwrap());
    assert!(line.runs[1].decoration.is_none());
}
