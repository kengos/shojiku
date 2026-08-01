//! 縦中横 (`textCombineUpright`) on vertical text blocks: measurement,
//! inheritance, and the guards. Fixed-pitch `biz-ud-gothic` (halfwidth
//! digits exactly 0.5em) makes extents exact.

mod guards;
mod measure;

use crate::common::*;

/// A single vertical flow text item; `style_extra` appends to the style
/// map (leading `, ` included by the caller).
pub(super) fn tmpl(text: &str, style_extra: &str) -> String {
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
        box: {{ w: 200, h: 100 }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl{style_extra} }}
"#
    )
}

#[test]
fn all_combines_the_whole_plain_block_into_one_cell() {
    // CSS `all`, honored literally on a plain block: the entire content
    // shares one upright cell (meant for short spans; documented).
    let (doc, diags) = run(&tmpl("31日", ", textCombineUpright: all"), json!({}));
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.text_combine, Some(shojiku_core::TextCombine::All));
    assert_eq!(block.lines.len(), 1);
    assert!(
        (block.lines[0].width - 10.0).abs() < 0.01,
        "extent {}",
        block.lines[0].width
    );
}

#[test]
fn the_block_carries_the_knob_for_the_renderers() {
    let (doc, diags) = run(
        &tmpl("あ12い", ", textCombineUpright: { digits: 2 }"),
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(
        block.text_combine,
        Some(shojiku_core::TextCombine::Digits(2))
    );
}
