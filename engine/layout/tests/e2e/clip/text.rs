//! `textOverflow: clip`: pixel-clip semantics on text blocks —
//! every line kept, exact height reserved, warning suppressed.

use super::{clip_shapes, only_clip};
use crate::common::*;
use shojiku_layout::LayoutItem;

#[test]
fn text_overflow_clip_keeps_lines_and_reserves_the_authored_height() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        box: { w: 100, h: 20 }
        text: "ああああああああああああああああああああああああああ"
        style: { fontSize: 10, lineHeight: 1.0, textOverflow: clip }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    // Opting into clipping suppresses the text_overflow warning.
    assert!(diags.is_empty(), "diags: {diags:?}");
    let clip = only_clip(&doc.pages[0]);
    assert_eq!((clip.w, clip.h), (100.0, 20.0));
    // Unlike ellipsis, clip keeps every wrapped line (the renderers cut
    // them at the box edge — a partial line stays partially visible).
    let LayoutItem::Text(block) = &clip.items[0] else {
        panic!("expected the text block inside the clip");
    };
    assert!(block.lines.len() > 2, "kept {} lines", block.lines.len());
    // The block reserves exactly the authored 20pt: the sibling lands
    // right below it, not below the overflowing content.
    assert_eq!(cell_pos(&doc.pages[0], "after"), (0.0, 20.0));
}

#[test]
fn text_overflow_clip_is_inert_without_a_definite_height() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        box: { w: 100 }
        text: "ああああああああああああ"
        style: { fontSize: 10, lineHeight: 1.0, textOverflow: clip }
"#,
        json!({}),
    );
    // Auto-height boxes grow to fit (the overflow-policy rule); nothing to clip.
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(clip_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn table_cell_clip_travels_with_the_paginated_row() {
    // A fixed row height activates cell textOverflow; `clip` in a
    // cell yields a clip node inside the row atom, which must translate
    // with the row through pagination.
    let rows: Vec<_> = (1..=30)
        .map(|i| json!({"name": format!("row{i} ああああああああああ")}))
        .collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 100 }
    items:
      - type: table
        data: { key: rows }
        row: { height: 12 }
        style: { fontSize: 10, lineHeight: 1.0 }
        columns:
          # textOverflow is not inherited: cell policies are authored on
          # the column, not the table style.
          - { data: { key: name }, width: 80, style: { textOverflow: clip } }
"#,
        json!({ "rows": rows }),
    );
    assert!(
        !diags.iter().any(|d| d.code == "text_overflow"),
        "clip suppresses the cell overflow warning: {diags:?}"
    );
    assert!(doc.pages.len() > 1, "paginates");
    // Every page's cell clips sit inside the flow region — the clip
    // rects were translated with their rows, never left at y 0 only.
    for (p, page) in doc.pages.iter().enumerate() {
        let clips = clip_shapes(page);
        assert!(!clips.is_empty(), "page {p} has cell clips");
        assert!(
            clips
                .iter()
                .all(|c| c.y >= 0.0 && c.y + c.h <= 100.0 + 1e-9),
            "page {p}: clip rects within the region"
        );
    }
    let last = clip_shapes(doc.pages.last().expect("pages"));
    assert!(
        last.iter().any(|c| c.y > 0.0),
        "later rows carry shifted clips"
    );
}

#[test]
fn text_overflow_visible_still_warns_where_clip_does_not() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        box: { w: 100, h: 20 }
        text: "ああああああああああああああああああああああああああ"
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "text_overflow"));
    assert!(clip_shapes(&doc.pages[0]).is_empty());
}
