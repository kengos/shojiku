//! Margin composition beyond single items: repeat-cell insets and
//! margin+padding on one box.

use crate::common::*;

#[test]
fn repeat_cell_margin_insets_the_cell_within_its_slot() {
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
          box: { margin: { top: 4, left: 6 } }
          items:
            - type: text
              data: { key: v }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "arr": [ { "v": "a" } ] }),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let line = &text_blocks(&doc.pages[0])[0].lines[0];
    assert_eq!((line.x, line.y), (16.0, 54.0));
}

#[test]
fn margin_and_padding_compose_on_one_item() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: both
        box: { x: 0, y: 0, w: 100, margin: 5, padding: 5 }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let line = &text_blocks(&doc.pages[0])[0].lines[0];
    assert_eq!((line.x, line.y), (10.0, 10.0));
}
