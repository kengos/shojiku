//! Leaf-item atoms end to end (mirrors src `engine/atoms.rs`): rect/line
//! sizing and color diagnostics; image fit and clipping in `image`.

mod image;
mod line_length;
mod line_style;

use crate::common::*;

#[test]
fn rect_without_size_warns_and_is_skipped() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 100 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "rect_missing_size"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn invalid_color_warns_and_falls_back_to_black() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: x
        style: { color: "not-a-color" }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_color"));
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].color, (0.0, 0.0, 0.0));
}

mod rect_style;
