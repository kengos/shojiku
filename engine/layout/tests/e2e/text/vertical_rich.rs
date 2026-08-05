//! Vertical (縦書き) rich `spans` end to end (`src/engine/text/vrich.rs`):
//! a `writingMode: vertical_rl` text item with `spans` renders per-span
//! runs down each right-to-left column. Fixed-pitch `biz-ud-gothic` (10pt,
//! lineHeight 1.0) makes every upright cell exactly 10pt down and every
//! column 10pt wide (unless a larger span widens it), so column and run
//! geometry is exact.

mod combine;
mod guards;

use crate::common::*;
use shojiku_core::TextOrientation;

/// A vertical `spans` text item with a definite box. `spans_yaml` is the
/// indented span list; `box_extra`/`style_extra` append to the box/style.
fn tmpl(spans_yaml: &str, box_extra: &str, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: text
        box: {{ w: 200, h: 100{box_extra} }}
        style: {{ fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl{style_extra} }}
        spans:
{spans_yaml}
"#
    )
}

#[test]
fn a_vertical_rich_block_marks_orientation_without_unsupported_warning() {
    let (doc, diags) = run(
        &tmpl("          - text: \"あ\"\n          - text: \"い\"", "", ""),
        json!({}),
    );
    assert!(!diags.has_errors());
    // Rich spans render vertically now — no `vertical_text_unsupported`.
    assert!(diags.iter().all(|d| d.code != "vertical_text_unsupported"));
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.vertical, Some(TextOrientation::Mixed));
    // One column carrying two per-span runs.
    assert_eq!(block.lines.len(), 1);
    assert_eq!(block.lines[0].runs.len(), 2);
}

#[test]
fn runs_stack_down_the_column() {
    // "あい"(span 0) then "うえ"(span 1), 10pt each → run 0 spans 0..20
    // down, run 1 resumes at 20 for another 20.
    let (doc, _d) = run(
        &tmpl(
            "          - text: \"あい\"\n          - text: \"うえ\"",
            "",
            "",
        ),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    let runs = &block.lines[0].runs;
    assert!((runs[0].x - 0.0).abs() < 0.01, "{:?}", runs[0].x);
    assert!((runs[0].width - 20.0).abs() < 0.01, "{:?}", runs[0].width);
    assert!((runs[1].x - 20.0).abs() < 0.01, "{:?}", runs[1].x);
    assert!((runs[1].width - 20.0).abs() < 0.01, "{:?}", runs[1].width);
    // The column's own extent is the sum of its runs.
    assert!((block.lines[0].width - 40.0).abs() < 0.01);
}

#[test]
fn the_largest_span_size_sets_the_column_width() {
    // span 0 is 20pt, span 1 is 10pt → the uniform column width is
    // 20pt (20 × lineHeight 1.0), like the horizontal rich line grid.
    let (doc, _d) = run(
        &tmpl(
            "          - { text: \"大\", style: { fontSize: 20 } }\n          - text: \"小\"",
            "",
            "",
        ),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert!(
        (block.line_height - 20.0).abs() < 0.01,
        "{:?}",
        block.line_height
    );
}

#[test]
fn columns_lay_out_right_to_left() {
    // 12 upright cells in a 100pt-tall box → two columns; the first sits
    // at the box right edge (x 0 + w 200 = 200, one 10pt col → 190) and
    // the second steps left by one column width.
    let (doc, _d) = run(
        &tmpl("          - text: \"あいうえおかきくけこさし\"", "", ""),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 2);
    assert!(
        (block.lines[0].x - 190.0).abs() < 0.01,
        "{:?}",
        block.lines[0].x
    );
    assert!((block.lines[0].x - block.lines[1].x - 10.0).abs() < 0.01);
}

#[test]
fn per_run_colors_carry_from_spans() {
    let (doc, _d) = run(
        &tmpl(
            "          - { text: \"青\", style: { color: \"#1155cc\" } }\n          - { text: \"赤\", style: { color: \"#cc3311\" } }",
            "",
            "",
        ),
        json!({}),
    );
    let runs = &text_blocks(&doc.pages[0])[0].lines[0].runs;
    assert_ne!(runs[0].color, runs[1].color);
}

#[test]
fn kinsoku_holds_a_comma_off_a_column_head() {
    // Two columns' worth of cells with a `。` that would otherwise begin
    // the second column; kinsoku pulls the prior cell down so no column
    // starts with `。` — even across the span boundary.
    let (doc, _d) = run(
        &tmpl(
            "          - text: \"あいうえおかきくけこ\"\n          - text: \"。さし\"",
            "",
            "",
        ),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.lines.len() >= 2);
    for line in &block.lines {
        assert!(
            !line.text.starts_with('。'),
            "a column starts with 。: {:?}",
            line.text
        );
    }
}

#[test]
fn a_span_link_rides_its_runs() {
    let (doc, _d) = run(
        &tmpl(
            "          - { text: \"リンク\", link: { url: \"https://example.com\" } }",
            "",
            "",
        ),
        json!({}),
    );
    let runs = &text_blocks(&doc.pages[0])[0].lines[0].runs;
    assert_eq!(runs[0].link.as_deref(), Some("https://example.com"));
}

#[test]
fn too_many_columns_warn_vertical_text_overflow_outside_a_flow_region() {
    // A 15pt-wide box holds one 10pt column; two columns overflow. As a
    // container child (not a direct flow item) the warn stays — a direct
    // flow rich block paginates instead (vertical_paginate).
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { w: 400, h: 120 }
        items:
          - type: text
            box: { x: 100, y: 0, w: 15, h: 100 }
            style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl }
            spans:
              - text: "あいうえおかきくけこさし"
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "vertical_text_overflow"));
}

#[test]
fn text_align_right_sits_a_short_column_at_the_bottom() {
    // A 2-cell column (20pt) in a 100pt box, textAlign right → the column
    // starts 80pt down (bottom-aligned along its length).
    let (doc, _d) = run(
        &tmpl("          - text: \"あい\"", "", ", textAlign: right"),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert!(
        (block.lines[0].y - 80.0).abs() < 0.01,
        "{:?}",
        block.lines[0].y
    );
}

#[test]
fn an_auto_basis_container_yields_one_column_per_paragraph() {
    // Inside an auto-height container there is no inline basis to wrap
    // against, so each `\n`-split paragraph is a single unconstrained
    // column (the vertical rich auto-height branch), never a one-cell
    // cascade. Two spans, no box.h.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: container
        box: { w: 250 }
        items:
          - type: text
            box: { x: 0, y: 0, w: 200 }
            style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl }
            spans:
              - text: "あいう"
              - text: "えお"
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 1, "unconstrained basis → one column");
    // Top-aligned (no slack to distribute on an infinite basis).
    assert!(block.lines[0].y.abs() < 0.01, "{:?}", block.lines[0].y);
    assert_eq!(block.lines[0].runs.len(), 2);
}

#[test]
fn a_block_level_bold_weight_uses_the_real_bold_face() {
    // biz-ud-gothic ships a real bold variant, so a block-level
    // `fontWeight: bold` resolves it (the `!real_bold` operand evaluates
    // false) rather than synthesizing bold.
    let (doc, _d) = run(
        &tmpl("          - text: \"太字\"", "", ", fontWeight: bold"),
        json!({}),
    );
    assert!(!text_blocks(&doc.pages[0])[0].synthetic_bold);
}

#[test]
fn a_bold_span_produces_a_run_without_synthetic_italic() {
    // A bold span resolves its own weight run; synthetic italic is never
    // applied on a rotated / stacked column (a horizontal skew is
    // meaningless there), matching the plain vertical block.
    let (doc, _d) = run(
        &tmpl(
            "          - { text: \"太\", style: { fontWeight: bold } }",
            "",
            "",
        ),
        json!({}),
    );
    let runs = &text_blocks(&doc.pages[0])[0].lines[0].runs;
    assert_eq!(runs[0].text, "太");
    assert!(!runs[0].synthetic_italic);
}
