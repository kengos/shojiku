//! Decoration placement: which boxes get the border/background rect,
//! its geometry, and its draw order.

use crate::common::*;

#[test]
fn text_border_strokes_the_border_box() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 10, y: 5, w: 80, h: 40 }
        style: { borderWidth: 2, borderColor: "#0000ff" }
"##,
        json!({}),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    let border = rects[0];
    assert_eq!(
        (border.x, border.y, border.w, border.h),
        (10.0, 5.0, 80.0, 40.0)
    );
    assert_eq!(border.stroke, Some((0.0, 0.0, 1.0)));
    assert_eq!(border.stroke_width, 2.0);
    assert!(border.fill.is_none());
}

#[test]
fn background_and_border_share_one_rect() {
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 0, y: 0, w: 50, h: 20 }
        style: { backgroundColor: "#ff0000", borderWidth: 1 }
"##,
        json!({}),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1, "fill and stroke ride one rect");
    assert_eq!(rects[0].fill, Some((1.0, 0.0, 0.0)));
    // borderColor unset: black, like rect items.
    assert_eq!(rects[0].stroke, Some((0.0, 0.0, 0.0)));
    assert_eq!(rects[0].stroke_width, 1.0);
}

#[test]
fn container_decoration_covers_the_border_box_under_children() {
    // Auto-height container: padding 5 around a 20pt-high child text →
    // border box is 30pt high, and the decoration precedes the child.
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 10, y: 0, w: 100, padding: 5 }
        style: { backgroundColor: "#00ff00", borderWidth: 1.5 }
        items:
          - type: text
            text: hi
            box: { x: 0, y: 0, w: 50, h: 20 }
"##,
        json!({}),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    let deco = rects[0];
    assert_eq!((deco.x, deco.y, deco.w, deco.h), (10.0, 0.0, 100.0, 30.0));
    assert_eq!(deco.fill, Some((0.0, 1.0, 0.0)));
    assert_eq!(deco.stroke_width, 1.5);
    // Painted before (under) the child text.
    assert!(matches!(doc.pages[0].items[0], LayoutItem::Rect(_)));
}

#[test]
fn container_border_is_not_inherited_by_children() {
    // The border is non-inherited: one rect for the container, none for
    // the child text.
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 100, h: 50 }
        style: { borderWidth: 1 }
        items:
          - type: text
            text: hi
            box: { x: 0, y: 0, w: 50, h: 20 }
"##,
        json!({}),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    // An explicit `h` is the decoration height (no auto-growth).
    assert_eq!(rects[0].h, 50.0);
}

#[test]
fn named_style_border_applies_via_the_registry() {
    let (doc, _) = run(
        r##"
styles:
  framed: { borderWidth: 0.8, borderColor: "#333333" }
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 0, y: 0, w: 50, h: 20 }
        styleNames: [framed]
"##,
        json!({}),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    assert_eq!(rects[0].stroke_width, 0.8);
    assert_eq!(rects[0].stroke, Some((0.2, 0.2, 0.2)));
}

#[test]
fn image_decoration_paints_under_the_image() {
    let assets = test_assets();
    let (doc, _) = run_with_assets(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: image
        src: logo.png
        box: { x: 10, y: 0, w: 40, h: 40 }
        style: { backgroundColor: "#0000ff", borderWidth: 1 }
"##,
        json!({}),
        Some(&assets),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    assert_eq!((rects[0].x, rects[0].w, rects[0].h), (10.0, 40.0, 40.0));
    assert_eq!(rects[0].fill, Some((0.0, 0.0, 1.0)));
    // Draw order: decoration rect first, image second.
    assert!(matches!(doc.pages[0].items[0], LayoutItem::Rect(_)));
    assert!(matches!(doc.pages[0].items[1], LayoutItem::Image(_)));
}

#[test]
fn repeat_cell_decoration_covers_each_slot() {
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: repeat
        data: { key: tickets }
        grid: { columns: 2, rows: 1 }
        cell:
          style: { borderWidth: 1 }
          items: []
"##,
        json!({ "tickets": [{}, {}] }),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 2, "one border per cell");
    // Cells tile the region left to right: 2 columns of 50pt.
    assert_eq!((rects[0].x, rects[0].w), (0.0, 50.0));
    assert_eq!((rects[1].x, rects[1].w), (50.0, 50.0));
}

#[test]
fn table_cell_border_via_column_style() {
    // Column styles feed the shared text-block path, so cell borders
    // work today; table-owned borders are their own wire.
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 200 }
    items:
      - type: table
        data: { key: rows }
        header: null
        repeatHeader: false
        columns:
          - data: { key: name }
            width: 100
            style: { borderWidth: 0.5, borderColor: "#0000ff" }
"##,
        json!({ "rows": [{ "name": "a" }] }),
    );
    let cell_borders: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.stroke == Some((0.0, 0.0, 1.0)))
        .collect();
    assert_eq!(cell_borders.len(), 1);
    assert_eq!(cell_borders[0].stroke_width, 0.5);
}
