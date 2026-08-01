//! Vertical (縦書き) text end to end: `writingMode: vertical_rl` turns a
//! plain text item into a column block laid right-to-left. Fixed-pitch
//! `biz-ud-gothic` (10pt, lineHeight 1.0) makes every column 10pt wide and
//! every upright cell a constant height, so column geometry is exact.

use crate::common::*;
use shojiku_core::TextOrientation;

/// A single vertical flow text item with a definite box.
fn tmpl(text: &str, style_extra: &str, box_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: text
        text: "{text}"
        box: {{ w: 200, h: 100{box_extra} }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl{style_extra} }}
"#
    )
}

#[test]
fn a_vertical_block_marks_its_orientation() {
    let (doc, diags) = run(&tmpl("あいうえお", "", ""), json!({}));
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.vertical, Some(TextOrientation::Mixed));
}

#[test]
fn columns_lay_out_right_to_left() {
    // 15 upright cells, ~10pt each, in a 100pt-tall box → ~10 per column,
    // so two columns. The first column sits at the box's right edge, the
    // second one column-width (10pt) to its left.
    let (doc, diags) = run(&tmpl("あいうえおかきくけこさしすせそ", "", ""), json!({}));
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 2);
    // Content right edge = x(0) + w(200) = 200; first column left = 190.
    assert!(
        (block.lines[0].x - 190.0).abs() < 0.01,
        "{:?}",
        block.lines[0].x
    );
    // The second column steps left by exactly one column width (10pt).
    assert!((block.lines[0].x - block.lines[1].x - 10.0).abs() < 0.01);
}

#[test]
fn columns_start_at_the_box_top() {
    let (doc, _d) = run(&tmpl("あい", "", ""), json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    // textAlign defaults to left → top of the column (y = 0, no padding).
    assert!((block.lines[0].y - 0.0).abs() < 0.01);
}

#[test]
fn text_align_center_offsets_the_column_down() {
    // One short column (2 cells ≈ 20pt) in a 100pt-tall content box:
    // centered → (100 - 20) / 2 = 40pt from the top.
    let (doc, _d) = run(&tmpl("あい", ", textAlign: center", ""), json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(
        block.lines[0].y > 30.0 && block.lines[0].y < 45.0,
        "{:?}",
        block.lines[0].y
    );
}

#[test]
fn writing_mode_inherits_from_a_container() {
    // The container sets vertical writing; the plain text child inherits it.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: container
        box: { w: 200, h: 100 }
        style: { writingMode: vertical_rl, fontFamily: biz-ud-gothic, fontSize: 10 }
        items:
          - type: text
            text: "あいう"
            box: { x: 0, y: 0, w: 100, h: 100 }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.vertical, Some(TextOrientation::Mixed));
}

#[test]
fn upright_orientation_reaches_the_tree() {
    let (doc, _d) = run(&tmpl("Ab", ", textOrientation: upright", ""), json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.vertical, Some(TextOrientation::Upright));
}

#[test]
fn a_link_on_vertical_text_reaches_the_tree() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "あいう"
        box: { w: 200, h: 100 }
        link: { url: "https://example.com" }
        style: { fontSize: 10, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.link.as_deref(), Some("https://example.com"));
}

#[test]
fn too_many_columns_warn_overflow_outside_a_flow_region() {
    // A 25pt-wide box holds two 10pt columns before overflowing left; a
    // long text needs more. As a CONTAINER child (not a direct flow item,
    // so column pagination cannot take over) it warns like any horizontal
    // overflow — the direct-flow case paginates instead (vertical_paginate).
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: container
        box: { w: 300, h: 100 }
        items:
          - type: text
            text: "あいうえおかきくけこさしすせそたちつてと"
            box: { x: 100, y: 0, w: 25, h: 30 }
            style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "horizontal_overflow"));
}

#[test]
fn auto_height_wraps_against_the_region() {
    // No box height: the column wraps against the flow region height and
    // the block still marks itself vertical (the auto-height branch).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 40 }
    items:
      - type: text
        text: "あいうえおかきく"
        box: { w: 200 }
        style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.vertical, Some(TextOrientation::Mixed));
    // The 40pt region fits ~4 cells per column → the 8 chars need 2 columns.
    assert!(block.lines.len() >= 2, "got {} columns", block.lines.len());
}

#[test]
fn text_align_right_pushes_the_column_to_the_bottom() {
    // A short column right-aligned sits at the box bottom: (100 - ~20).
    let (doc, _d) = run(&tmpl("あい", ", textAlign: right", ""), json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.lines[0].y > 70.0, "got {:?}", block.lines[0].y);
}

#[test]
fn lines_carry_the_column_down_extent() {
    // Three fixed-pitch cells: the line's `width` is the measured extent
    // DOWN the column (the link-annotation rect side), not the cross-axis
    // column width (which rides `line_height`).
    let (doc, _d) = run(&tmpl("あいう", "", ""), json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(
        block.lines[0].width > 2.5 * block.line_height,
        "expected a 3-cell down-extent, got width {} vs column width {}",
        block.lines[0].width,
        block.line_height
    );
}

#[test]
fn an_over_tall_vertical_block_stays_atom_unit() {
    // A giant font makes every cell taller than the flow region, so the
    // auto-height block exceeds it — the horizontal splitter must NOT
    // restack the columns as rows (`y = k × line_height`); the block
    // places whole, columns side by side at the top.
    let (doc, _d) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 60 }
    items:
      - type: text
        text: "ああああ"
        box: { w: 500 }
        style: { fontSize: 80, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
"#,
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1, "atom-unit: no per-column page split");
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 4, "one over-tall char per column");
    for line in &block.lines {
        assert!(line.y.abs() < 0.01, "columns stay at the top: {:?}", line.y);
    }
}

#[test]
fn an_auto_basis_yields_a_single_column() {
    // Inside an auto-height container there is no inline basis to wrap
    // against: the column length is unconstrained (CSS auto) — one column,
    // never a one-char-per-column cascade.
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
            text: "あいうえおかきく"
            box: { x: 0, y: 0, w: 200 }
            style: { fontSize: 10, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 1, "unconstrained basis → one column");
    assert!(block.lines[0].y.is_finite() && block.lines[0].y.abs() < 0.01);
}
