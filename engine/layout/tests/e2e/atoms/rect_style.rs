//! rect under the unified Style (shape-style convergence): no
//! implicit stroke, per-side borders via the decoration path,
//! named styles like every other item.

use crate::common::*;

#[test]
fn a_bare_rect_draws_nothing_but_reserves_its_box() {
    // Convergence semantics: like every other item, a rect with no
    // authored style paints nothing (the implicit 1pt stroke is gone) —
    // but it still occupies flow space.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: rect
        box: { w: 100, h: 40 }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(rect_shapes(&doc.pages[0]).is_empty(), "no paint");
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 40.0, "reserved");
}

#[test]
fn rect_supports_per_side_borders_and_style_names() {
    // The unified Style gives rect the full decoration path: a per-side
    // map draws edge bands (not one stroked rect), and named styles
    // layer under the inline style like any other item.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
styles:
  panel: { backgroundColor: '#eeeeee' }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: rect
        box: { w: 100, h: 40 }
        styleNames: [panel]
        style: { borderWidth: { bottom: 2 }, borderColor: '#336699' }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    // The named-style fill + one bottom border band, both fill-only.
    assert_eq!(rects.len(), 2, "fill + one side band: {rects:?}");
    assert!(rects.iter().all(|r| r.stroke.is_none()));
    let band = rects[1];
    assert_eq!(band.h, 2.0, "bottom band thickness");
    assert_eq!(band.fill, Some((0.2, 0.4, 0.6)), "borderColor #336699");
}
