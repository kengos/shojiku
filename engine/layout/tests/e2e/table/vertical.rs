//! Vertical (縦書き) table text cells end to end (mirrors src
//! `engine/table/rows.rs`): a cell whose column style is
//! `writingMode: vertical_rl` renders its text as columns. An auto row is
//! as tall as the longest column (measure == render); a definite
//! `row.height` wraps columns against it. Fixed-pitch `biz-ud-gothic`
//! (10pt) makes each upright cell exactly 10pt down.

use crate::common::*;
use shojiku_core::TextOrientation;

/// The vertical cell's text block on a page (a table flattens cells into
/// page-level text blocks; the vertical one carries `vertical: Some`).
fn vertical_block(page: &LayoutPage) -> &TextBlock {
    text_blocks(page)
        .into_iter()
        .find(|b| b.vertical.is_some())
        .expect("a vertical cell block")
}

fn count(diags: &Diagnostics, code: &str) -> usize {
    diags.iter().filter(|d| d.code == code).count()
}

/// A one-column vertical table. `row_kv` sets the `row:` map, `style_extra`
/// appends to the column style.
fn tmpl(row_kv: &str, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: table
        data: {{ key: items }}
        row: {{ {row_kv} }}
        columns:
          - label: v
            data: {{ key: v }}
            width: 60
            style: {{ fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl{style_extra} }}
"#
    )
}

#[test]
fn a_vertical_text_cell_renders_columns() {
    let (doc, _d) = run_auto("あいう");
    let block = vertical_block(&doc.pages[0]);
    assert_eq!(block.vertical, Some(TextOrientation::Mixed));
    // One column, three 10pt cells → 30pt down-extent.
    assert_eq!(block.lines.len(), 1);
    assert!(
        (block.lines[0].width - 30.0).abs() < 0.01,
        "{:?}",
        block.lines[0].width
    );
}

#[test]
fn an_auto_row_grows_to_the_longest_column_without_drift() {
    // A five-cell entry (50pt) in an auto row: the row grows so the column
    // is not wrapped or clipped (measure == render). One column, full
    // 50pt extent, no overflow warning.
    let (doc, diags) = run_auto("あいうえお");
    assert!(!diags.has_errors());
    assert_eq!(count(&diags, "horizontal_overflow"), 0);
    let block = vertical_block(&doc.pages[0]);
    assert_eq!(block.lines.len(), 1, "the row must not wrap the column");
    assert!(
        (block.lines[0].width - 50.0).abs() < 0.01,
        "{:?}",
        block.lines[0].width
    );
}

#[test]
fn a_definite_row_height_wraps_columns() {
    // A 30pt row (26pt after cell padding) with a five-cell (50pt) entry
    // wraps the column — it no longer fits as one.
    let (doc, _d) = run(&tmpl("height: 30", ""), json_items("あいうえお"));
    let block = vertical_block(&doc.pages[0]);
    assert!(
        block.lines.len() > 1,
        "expected wrapping: {}",
        block.lines.len()
    );
}

#[test]
fn a_text_overflow_knob_on_a_vertical_cell_no_longer_warns() {
    // The block knobs apply on vertical columns now (textOverflow runs
    // against the cell width), so `vertical_style_ignored` never fires —
    // from neither the silent measure pass nor the render pass.
    let (_doc, diags) = run(
        &tmpl("height: 30", ", textOverflow: ellipsis"),
        json_items("あいうえお"),
    );
    assert_eq!(count(&diags, "vertical_style_ignored"), 0);
}

#[test]
fn the_table_default_valign_does_not_warn_on_a_vertical_cell() {
    // A plain vertical cell sets no inert knob; the table's own default
    // `verticalAlign: Middle` must NOT surface as `vertical_style_ignored`
    // (it is a table default, not an authored knob).
    let (_doc, diags) = run_auto("あいう");
    assert_eq!(count(&diags, "vertical_style_ignored"), 0);
}

/// Two rows so both the measure and the placement paths run; the params
/// carry the single cell value `v`.
fn json_items(v: &str) -> Value {
    json!({ "items": [ { "v": v } ] })
}

/// The auto-row template (no `row.height`).
fn run_auto(v: &str) -> (LayoutDocument, Diagnostics) {
    run(&tmpl("", ""), json_items(v))
}

#[test]
fn a_params_driven_10k_char_cell_degrades_without_hanging() {
    // An auto row's unconstrained column makes a params-driven 10k-char
    // paragraph one very tall row; the measure is O(n) and the flow
    // degrades through pagination/overflow — bounded, never a hang or
    // panic (the security bar's params-length case).
    let long: String = "あ".repeat(10_000);
    let (doc, _diags) = run_auto(&long);
    assert!(!doc.pages.is_empty());
}

#[test]
fn a_vertical_cell_sits_at_the_cell_right_edge() {
    // 縦書き columns start from the right, so a single column sits in the
    // right half of the 60pt-wide cell (cell x 0), not against its left.
    let (doc, _d) = run_auto("あ");
    let block = vertical_block(&doc.pages[0]);
    assert!(
        block.lines[0].x > 30.0,
        "column not right-aligned: {:?}",
        block.lines[0].x
    );
}
