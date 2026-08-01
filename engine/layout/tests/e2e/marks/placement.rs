//! Marks across placement contexts: header/footer bands, absolute
//! container children, and flex cross-axis offset (the horizontal
//! translate of a path).

use crate::common::*;

#[test]
fn marks_render_in_a_header_band() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: checkbox
        box: { x: 10, y: 5, w: 10, h: 10 }
        checked: true
      - type: ellipse
        box: { x: 30, y: 5, w: 20, h: 14 }
  body:
    type: flow
    items: []
"#,
        json!({}),
    );
    // Checkbox frame (Rect) + its check (Path) + the ellipse (Path).
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1);
    assert_eq!(path_shapes(&doc.pages[0]).len(), 2);
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn marks_render_as_absolute_container_children() {
    // `box.x`/`box.y` present → the absolute-child path, not flex.
    let (doc, diags) = run(
        r#"
page: { size: A4 }
sections:
  body:
    type: flow
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, h: 100 }
        items:
          - type: checkbox
            box: { x: 5, y: 5, w: 10, h: 10 }
            checked: true
          - type: ellipse
            box: { x: 30, y: 5, w: 20, h: 14 }
"#,
        json!({}),
    );
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1);
    assert_eq!(path_shapes(&doc.pages[0]).len(), 2);
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn flex_cross_alignment_shifts_a_mark_horizontally() {
    // `alignItems: center` in a column gives each flex child a nonzero
    // cross (x) offset — the path's horizontal translate.
    let (doc, _) = run(
        r#"
page: { size: A4 }
sections:
  body:
    type: flow
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, h: 100, type: flex, direction: column, alignItems: center }
        items:
          - type: ellipse
            box: { w: 20, h: 14 }
"#,
        json!({}),
    );
    let path = path_shapes(&doc.pages[0])[0];
    // Centered in a 200pt-wide box, the 20pt ellipse starts near x≈90,
    // not at 0 — proof the horizontal translate ran.
    if let shojiku_image::PathCmd::MoveTo(x, _) = path.cmds[0] {
        assert!(x > 50.0, "expected a centered x, got {x}");
    } else {
        panic!("first cmd is a MoveTo");
    }
}
