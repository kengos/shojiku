//! `textDecoration` on the PDF backend: decoration rects render and
//! `opacity` surfaces as PDF graphics-state alpha (pixel-exact behavior
//! is asserted on the PNG backend, which shares the tree contract).

use super::*;

#[test]
fn renders_decoration_and_opacity() {
    let bytes = render_template(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: text
        text: 下線つき
        box: { w: 200 }
        style: { fontSize: 20, textDecoration: underline, opacity: 0.5 }
      - type: text
        text: 取り消し
        box: { w: 200 }
        style: { fontSize: 20, textDecoration: line_through }
      - type: rect
        box: { w: 100, h: 30 }
        style: { backgroundColor: '#00ff00', opacity: 0.25 }
"##,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    // krilla writes non-1 paint alpha as an ExtGState `/ca` entry.
    let content = String::from_utf8_lossy(&bytes);
    assert!(content.contains("/ca"), "no fill-alpha ExtGState in output");
}

#[test]
fn fully_opaque_output_carries_no_alpha_state() {
    // The opacity plumbing must not perturb opaque documents: no `/ca`
    // ExtGState unless something is actually translucent.
    let bytes = render_template(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: text
        text: 不透明
        box: { w: 200 }
        style: { fontSize: 20, textDecoration: underline }
"##,
        json!({}),
    );
    let content = String::from_utf8_lossy(&bytes);
    assert!(!content.contains("/ca"), "unexpected alpha state");
}
