//! `box.padding` on nesting boxes: containers (child basis,
//! auto-height, border-box) and repeat cells.

use crate::common::*;

#[test]
fn container_padding_insets_children_and_grows_auto_height() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    gap: 0
    items:
      - type: container
        box: { padding: { top: 6, bottom: 4 } }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 10 }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    assert_eq!(rect.y, 106.0);
    // Auto height = child bottom (10) + padding 6 + 4 = 20.
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 120.0);
}
#[test]
fn container_padding_shrinks_the_percent_basis() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: container
        box: { w: 200, padding: { left: 50, right: 50 } }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: "100%", h: 10 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    assert_eq!((rect.x, rect.w), (50.0, 100.0));
}
#[test]
fn container_explicit_height_stays_border_box_and_overflow_uses_content_box() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    gap: 0
    items:
      - type: container
        box: { h: 30, padding: { top: 10, bottom: 10 } }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 25 }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    // 25pt of content in a 30 - 20 = 10pt content box overflows...
    assert!(diags.iter().any(|d| d.code == "container_overflow"));
    // ...but the reserved height stays the authored border-box 30pt.
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 130.0);
}
#[test]
fn repeat_cell_padding_insets_scoped_children() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 10, y: 50, w: 400, h: 500 }
    items:
      - type: repeat
        data: { key: arr }
        cell:
          box: { padding: { top: 5, left: 7 } }
          items:
            - type: text
              data: { key: v }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "arr": [ { "v": "a" } ] }),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let line = &text_blocks(&doc.pages[0])[0].lines[0];
    assert_eq!((line.x, line.y), (17.0, 55.0));
}
