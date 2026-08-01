//! 縦中横 on rich (`spans`) vertical blocks: the span cascade carries
//! `textCombineUpright` per span (block value inherited, span override
//! honored), runs measure combined groups as one cell, and the `all`
//! keyword combines a whole span atomically. Fixed-pitch `biz-ud-gothic`
//! (halfwidth digits exactly 0.5em) keeps extents exact.

use crate::common::*;
use shojiku_core::TextCombine;

/// A vertical spans item; `box_h`/`style_extra` tune the fixture.
fn tmpl(spans_yaml: &str, box_h: u32, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: text
        box: {{ w: 200, h: {box_h} }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl{style_extra} }}
        spans:
{spans_yaml}
"#
    )
}

/// The rich block of the page.
fn rich_block(page: &LayoutPage) -> &TextBlock {
    text_blocks(page)
        .into_iter()
        .find(|b| !b.lines.is_empty() && !b.lines[0].runs.is_empty())
        .expect("rich block")
}

#[test]
fn a_span_level_digits_run_measures_one_cell() {
    // "123" per char is 15pt (halfwidth digits); combined it is one 10pt
    // cell. The run records its combine for the renderers.
    let yaml = tmpl(
        "          - text: あ\n          - { text: \"123\", style: { textCombineUpright: { digits: 3 } } }",
        100,
        "",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let run = &rich_block(&doc.pages[0]).lines[0].runs[1];
    assert!((run.width - 10.0).abs() < 0.01, "width {}", run.width);
    assert_eq!(run.combine, Some(TextCombine::Digits(3)));
}

#[test]
fn a_block_level_combine_inherits_into_spans() {
    let yaml = tmpl(
        "          - text: あ\n          - text: \"123\"",
        100,
        ", textCombineUpright: { digits: 3 }",
    );
    let (doc, _d) = run(&yaml, json!({}));
    let run = &rich_block(&doc.pages[0]).lines[0].runs[1];
    assert!((run.width - 10.0).abs() < 0.01, "width {}", run.width);
    assert_eq!(run.combine, Some(TextCombine::Digits(3)));
}

#[test]
fn a_span_level_none_overrides_the_block() {
    let yaml = tmpl(
        "          - text: あ\n          - { text: \"123\", style: { textCombineUpright: none } }",
        100,
        ", textCombineUpright: { digits: 3 }",
    );
    let (doc, _d) = run(&yaml, json!({}));
    let run = &rich_block(&doc.pages[0]).lines[0].runs[1];
    assert!((run.width - 15.0).abs() < 0.01, "width {}", run.width);
    assert_eq!(run.combine, None);
}

#[test]
fn an_all_span_is_one_atomic_cell_across_wrapping() {
    // Column height 20 holds two cells: な + the combined 31 fill column
    // 0; 日 wraps to column 1 — the all-span never splits.
    let yaml = tmpl(
        "          - text: な\n          - { text: \"31\", style: { textCombineUpright: all } }\n          - text: 日",
        20,
        "",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let block = rich_block(&doc.pages[0]);
    assert_eq!(block.lines.len(), 2, "two columns");
    let col0 = &block.lines[0];
    assert_eq!(col0.runs.len(), 2);
    assert!((col0.runs[1].width - 10.0).abs() < 0.01);
    assert_eq!(col0.runs[1].combine, Some(TextCombine::All));
    assert_eq!(block.lines[1].runs[0].text, "日");
}

#[test]
fn adjacent_all_spans_stay_separate_cells() {
    // Two consecutive `all` spans: each combines its OWN content — one
    // cell per span, never one merged cell.
    let yaml = tmpl(
        "          - { text: \"12\", style: { textCombineUpright: all } }\n          - { text: \"34\", style: { textCombineUpright: all } }",
        100,
        "",
    );
    let (doc, _d) = run(&yaml, json!({}));
    let line = &rich_block(&doc.pages[0]).lines[0];
    assert_eq!(line.runs.len(), 2);
    assert!((line.runs[0].width - 10.0).abs() < 0.01);
    assert!((line.runs[1].width - 10.0).abs() < 0.01);
    // The second cell stacks below the first.
    assert!((line.runs[1].x - 10.0).abs() < 0.01);
}

#[test]
fn an_over_wide_all_span_compresses_into_its_cell() {
    // 8 rotated Latin chars would run ~40pt; `all` combines them into
    // one 10pt cell (compress-only).
    let yaml = tmpl(
        "          - { text: abcdefgh, style: { textCombineUpright: all } }",
        100,
        "",
    );
    let (doc, _d) = run(&yaml, json!({}));
    let run = &rich_block(&doc.pages[0]).lines[0].runs[0];
    assert!((run.width - 10.0).abs() < 0.01, "width {}", run.width);
}

#[test]
fn a_hostile_long_all_span_terminates_with_one_finite_cell() {
    // 5000 chars under `all`: shaped once, compressed once — the run is
    // still exactly one finite cell and layout completes.
    let text = "1".repeat(5000);
    let yaml = tmpl(
        &format!("          - {{ text: \"{text}\", style: {{ textCombineUpright: all }} }}"),
        100,
        "",
    );
    let (doc, _d) = run(&yaml, json!({}));
    let run = &rich_block(&doc.pages[0]).lines[0].runs[0];
    assert!(run.width.is_finite());
    assert!((run.width - 10.0).abs() < 0.01, "width {}", run.width);
}
