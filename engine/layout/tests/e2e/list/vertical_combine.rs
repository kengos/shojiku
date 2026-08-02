//! 縦中横 in vertical lists: entries measure combined digit runs as one
//! cell, the definite-`h` `…` clamp never splits a combined group (kept
//! whole or dropped whole — including AT the exact-fit boundary), and
//! `all` makes a whole entry one cell. Fixed-pitch `biz-ud-gothic`
//! (halfwidth digits exactly 0.5em) keeps extents exact.

use crate::common::*;
use shojiku_core::TextCombine;

/// A vertical list of string entries with 縦中横 style keys.
fn tmpl(box_kv: &str, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: list
        data: {{ key: rows }}
        box: {{ {box_kv} }}
        style: {{ fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl{style_extra} }}
"#
    )
}

#[test]
fn a_digit_run_in_an_entry_measures_one_cell() {
    // "123あ" per char is 25pt; combined the digits share one 10pt cell
    // → 20pt. The block carries the knob for the renderers.
    let (doc, diags) = run(
        &tmpl(
            "x: 0, y: 0, w: 200, h: 100",
            ", textCombineUpright: { digits: 3 }",
        ),
        json!({ "rows": ["123あ"] }),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.text_combine, Some(TextCombine::Digits(3)));
    assert!(
        (block.lines[0].width - 20.0).abs() < 0.01,
        "extent {}",
        block.lines[0].width
    );
}

#[test]
fn the_down_clamp_keeps_a_combined_group_whole_at_the_exact_fit() {
    // Units: [123] (10) + あ (10) + い (10) = 30pt. h:20 admits exactly
    // the group + the 10pt `…` — the clamp boundary: the group is kept
    // WHOLE, never split mid-group.
    let (doc, _d) = run(
        &tmpl(
            "x: 0, y: 0, w: 200, h: 20",
            ", textCombineUpright: { digits: 3 }",
        ),
        json!({ "rows": ["123あい"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines[0].text, "123…");
    assert!(
        (block.lines[0].width - 20.0).abs() < 0.01,
        "extent {}",
        block.lines[0].width
    );
}

#[test]
fn the_down_clamp_drops_a_group_that_does_not_fit() {
    // h:15 cannot hold the 10pt group plus the 10pt `…`: the group drops
    // whole — never a partial digit run.
    let (doc, _d) = run(
        &tmpl(
            "x: 0, y: 0, w: 200, h: 15",
            ", textCombineUpright: { digits: 3 }",
        ),
        json!({ "rows": ["123あい"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines[0].text, "…");
}

#[test]
fn an_all_entry_is_one_cell_and_clamps_whole() {
    let (doc, _d) = run(
        &tmpl("x: 0, y: 0, w: 200, h: 100", ", textCombineUpright: all"),
        json!({ "rows": ["abcd"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.text_combine, Some(TextCombine::All));
    assert!(
        (block.lines[0].width - 10.0).abs() < 0.01,
        "extent {}",
        block.lines[0].width
    );
    // A height under the 10pt cell cannot hold it at all: the whole
    // entry drops (never a partial combined group).
    let (doc, _d) = run(
        &tmpl("x: 0, y: 0, w: 200, h: 8", ", textCombineUpright: all"),
        json!({ "rows": ["abcd"] }),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines[0].text, "…");
}
