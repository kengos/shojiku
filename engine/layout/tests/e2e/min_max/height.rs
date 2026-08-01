//! min/max height: authored + auto-height clamp on containers, text
//! auto-height reservation with vertical-align, and the flow cursor.

use crate::common::*;

#[test]
fn min_height_reserves_extra_space_on_an_auto_container() {
    // The container's content is one 10pt rect, but minHeight 80 reserves
    // 80pt, so the following flow item lands at y 80.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { minHeight: 80 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: 50, h: 10 }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "after"), (0.0, 80.0));
}

#[test]
fn max_height_cuts_an_auto_container_without_warning() {
    // Auto content is 100pt of rect, but maxHeight 40 caps the reserved
    // height; the sibling follows at y 40 (content overflows visually,
    // like a too-short explicit height, but the author set the bound so
    // there is no warning).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { maxHeight: 40 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: 50, h: 100 }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "no container_overflow: {diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "after"), (0.0, 40.0));
}

#[test]
fn min_height_on_text_reserves_and_vertical_align_distributes() {
    // One 10pt line, minHeight 50, bottom-aligned: the line sits at the
    // bottom of the reserved 50pt box (y 40), proving the clamp feeds the
    // vertical-align slack, not just the reserved height.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        box: { w: 200, minHeight: 50 }
        text: "hi"
        style: { fontSize: 10, lineHeight: 1.0, verticalAlign: bottom }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // The "hi" line is pushed to the bottom of the 50pt reserved box.
    assert_eq!(cell_pos(&doc.pages[0], "hi").1, 40.0);
    // The reserved 50pt height pushes the sibling to y 50.
    assert_eq!(cell_pos(&doc.pages[0], "after"), (0.0, 50.0));
}

#[test]
fn authored_height_is_clamped_by_max_height() {
    // An explicit h 200 capped to 60 by maxHeight; the sibling follows at
    // y 60.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { h: 200, maxHeight: 60 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: 10, h: 10 }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "after"), (0.0, 60.0));
}
