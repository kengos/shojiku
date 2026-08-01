//! Vertical (縦書き) degrade paths: a `writingMode: vertical_rl` that
//! reaches a context v1 still does not render vertically is reported
//! (`vertical_text_unsupported` for a text `mark:` — the one remaining
//! warned fallback), and the block-level knobs that don't apply to a
//! column are reported inert (`vertical_style_ignored`). Mistakes surface
//! as diagnostics, never silently drop. Rich `spans` / `list` / table
//! cells / `page_number` now render vertically — their positive coverage
//! lives beside each surface.

use crate::common::*;

fn count(diags: &Diagnostics, code: &str) -> usize {
    diags.iter().filter(|d| d.code == code).count()
}

#[test]
fn a_text_mark_reports_vertical_as_unsupported() {
    // A `mark:` (丸囲み) on a vertical text item is a horizontal overlay;
    // it is skipped and reported, not painted in the wrong axis.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "甲"
        box: { w: 200, h: 100 }
        style: { fontSize: 10, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
        mark: { style: { borderWidth: 1 } }
"#,
        json!({}),
    );
    assert_eq!(count(&diags, "vertical_text_unsupported"), 1);
    // The overlay path was NOT emitted (a horizontal mark would add one).
    assert!(path_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn block_knobs_apply_instead_of_warning() {
    // textDecoration + verticalAlign on a vertical block are honored now:
    // no `vertical_style_ignored`, a side-band decoration on the block,
    // and the middle stack shift moves the single column off the right
    // edge (details pinned in the vertical_knobs suite).
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
        style: { fontSize: 10, fontFamily: biz-ud-gothic, writingMode: vertical_rl, textDecoration: underline, verticalAlign: middle }
"#,
        json!({}),
    );
    assert_eq!(count(&diags, "vertical_style_ignored"), 0);
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.decoration.is_some());
}
