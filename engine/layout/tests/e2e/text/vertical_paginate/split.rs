//! The happy splitting paths: fragment sizes, reading order, decoration
//! cloning, and the per-fragment box index.

use super::tmpl;
use crate::common::*;

#[test]
fn columns_continue_across_pages_in_reading_order() {
    // 20 chars, 3 cells per 30pt column → 7 columns; a 25pt box holds 2
    // per page → 4 pages, the LAST page carrying the leftover column.
    let (doc, diags) = run(
        &tmpl(
            "あいうえおかきくけこさしすせそたちつてと",
            "w: 25, h: 30",
            "",
            "",
        ),
        json!({}),
    );
    assert!(
        !diags.iter().any(|d| d.code == "horizontal_overflow"),
        "pagination replaces the overflow warning: {diags:?}"
    );
    assert_eq!(doc.pages.len(), 4);
    let first = text_blocks(&doc.pages[0])[0];
    assert_eq!(line_texts(first), vec!["あいう", "えおか"]);
    // Each page's first column re-starts at the content right edge (25 −
    // 10), the second one column left.
    assert!((first.lines[0].x - 15.0).abs() < 0.01);
    assert!((first.lines[1].x - 5.0).abs() < 0.01);
    let last = text_blocks(&doc.pages[3])[0];
    assert_eq!(line_texts(last), vec!["てと"]);
}

#[test]
fn a_mid_page_block_breaks_to_a_fresh_page_first() {
    // A 280pt leading rect leaves 20pt — not enough for the 30pt-tall
    // vertical block, so the first fragment starts on page 2.
    let lead =
        "      - type: rect\n        box: { w: 100, h: 280 }\n        style: { borderWidth: 1 }\n";
    let (doc, _diags) = run(
        &tmpl(
            "あいうえおかきくけこさしすせそたちつてと",
            "w: 25, h: 30",
            lead,
            "",
        ),
        json!({}),
    );
    assert!(
        text_blocks(&doc.pages[0]).is_empty(),
        "page 1 is the rect's"
    );
    assert_eq!(
        line_texts(text_blocks(&doc.pages[1])[0]),
        vec!["あいう", "えおか"]
    );
}

#[test]
fn decoration_is_cloned_onto_every_fragment() {
    let (doc, _diags) = run(
        &tmpl(
            "あいうえおかきくけこさしすせそたちつてと",
            "w: 25, h: 30",
            "",
            ", backgroundColor: \"#eeeeee\"",
        ),
        json!({}),
    );
    assert!(doc.pages.len() > 1);
    for page in &doc.pages {
        assert!(
            rect_shapes(page).iter().any(|r| r.fill.is_some()),
            "fragment page without its background"
        );
    }
}

#[test]
fn each_fragment_carries_its_own_column_metrics() {
    let out = run_full(
        &tmpl(
            "あいうえおかきくけこさしすせそたちつてと",
            "w: 25, h: 30",
            "",
            "",
        ),
        json!({}),
    );
    assert_eq!(out.boxes.pages.len(), 4);
    for (i, page) in out.boxes.pages.iter().enumerate() {
        let pb = page
            .iter()
            .find(|b| b.id.as_deref() == Some("v"))
            .expect("per-fragment placement");
        let cols = pb.text.as_ref().and_then(|t| t.columns()).expect("columns");
        let expect = if i < 3 { 2 } else { 1 };
        assert_eq!(cols.len(), expect, "page {i}");
    }
}

#[test]
fn rich_spans_paginate_with_their_runs() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        box: { w: 15, h: 30 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl }
        spans:
          - { text: "あいうえ", style: { fontWeight: bold } }
          - { text: "おか" }
"#,
        json!({}),
    );
    assert!(!diags.iter().any(|d| d.code == "horizontal_overflow"));
    // 6 cells → 2 columns; a 15pt box holds one per page.
    assert_eq!(doc.pages.len(), 2);
    let p2 = text_blocks(&doc.pages[1])[0];
    assert_eq!(line_texts(p2), vec!["えおか"]);
    assert!(!p2.lines[0].runs.is_empty(), "runs ride the fragment");
}
