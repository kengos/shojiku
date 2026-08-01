//! Row flex: side-by-side placement, equal shares, cross alignment.

use super::*;

#[test]
fn row_places_fixed_width_children_side_by_side() {
    let two = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 20 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, gap: 10 }",
        two,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let xs: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.x).collect();
    assert_eq!(xs, vec![0.0, 90.0]);
    // free = 200 - 170 = 30: end shifts the whole row right.
    let end = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, gap: 10, justifyContent: end }",
        two,
    );
    let (doc, _) = run(&end, json!({}));
    let xs: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.x).collect();
    assert_eq!(xs, vec![30.0, 120.0]);
}

#[test]
fn row_children_without_width_split_the_leftover_equally() {
    let children = "- type: container\n  box: { h: 20 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }\n- type: container\n  box: { h: 20 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, gap: 10 }",
        children,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let rects = rect_shapes(&doc.pages[0]);
    // (200 - 10) / 2 = 95 per share; the inner rects fill their share.
    assert_eq!((rects[0].x, rects[0].w), (0.0, 95.0));
    assert_eq!((rects[1].x, rects[1].w), (105.0, 95.0));
}

#[test]
fn row_unsized_children_split_leftover_by_flex_grow() {
    // Two unsized children weighted 2:1 split the 120pt leftover (w 130,
    // gap 10) as 80:40 instead of the equal 60:60 (D4).
    let children = "- type: container\n  box: { h: 20, flexGrow: 2 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }\n- type: container\n  box: { h: 20, flexGrow: 1 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 130, h: 40, direction: row, gap: 10 }",
        children,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].w), (0.0, 80.0));
    assert_eq!((rects[1].x, rects[1].w), (90.0, 40.0));
}

#[test]
fn row_flex_grow_ignores_fixed_sibling_and_warns_on_negative() {
    // A fixed-width child is excluded from the weighted split; the two
    // unsized children (weights 2:1) share the 180pt leftover as 120:60.
    let children = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 60, h: 20 }\n- type: container\n  box: { h: 20, flexGrow: 2 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }\n- type: container\n  box: { h: 20, flexGrow: 1 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }";
    let yaml = container_body("{ x: 0, y: 0, w: 240, h: 40, direction: row }", children);
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    // rects[0] is the fixed sibling; the two inner fills follow it.
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[1].x, rects[1].w), (60.0, 120.0));
    assert_eq!((rects[2].x, rects[2].w), (180.0, 60.0));

    // A negative weight warns and degrades to 0, so its sibling takes all.
    let neg = "- type: container\n  box: { h: 20, flexGrow: -1 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }\n- type: container\n  box: { h: 20, flexGrow: 1 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }";
    let yaml = container_body("{ x: 0, y: 0, w: 100, h: 40, direction: row }", neg);
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "invalid_flex_grow"));
    let rects = rect_shapes(&doc.pages[0]);
    // The negative-weight child collapsed (its fill floors near 0); the
    // sibling took the full width.
    assert!(
        rects[0].w <= 1.0,
        "collapsed child too wide: {}",
        rects[0].w
    );
    assert_eq!((rects[1].x, rects[1].w), (0.0, 100.0));
}

#[test]
fn row_cross_axis_aligns_and_auto_vertical_margin_pushes_down() {
    let two = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 30 }";
    let center = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, alignItems: center }",
        two,
    );
    let (doc, _) = run(&center, json!({}));
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(ys, vec![10.0, 5.0]);
    // Default stretch keeps measured heights top-aligned (v1: no cross
    // stretching in rows).
    let default = container_body("{ x: 0, y: 0, w: 200, h: 40, direction: row }", two);
    let (doc, _) = run(&default, json!({}));
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(ys, vec![0.0, 0.0]);
    let auto = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 20, margin: { top: auto } }",
    );
    let (doc, _) = run(&auto, json!({}));
    assert_eq!(rect_shapes(&doc.pages[0])[0].y, 20.0);
}

#[test]
fn row_auto_horizontal_margins_absorb_free_space() {
    // All-fixed row: {left: auto, right: auto} centers the lone child.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 100, h: 20, margin: { left: auto, right: auto } }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    assert_eq!(rect_shapes(&doc.pages[0])[0].x, 50.0);
}

#[test]
fn row_mixes_unsized_text_with_a_fixed_image_and_aligns_images() {
    // The text child (no `w`) takes the leftover share next to the
    // fixed-width image; a second flexed image is end-aligned on the
    // cross axis (the image x/y shift paths).
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, h: 40, direction: row, gap: 10 }
        items:
          - type: image
            box: { w: 30, h: 30 }
            src: logo.png
          - type: text
            text: aaa
      - type: container
        box: { x: 0, y: 60, w: 200, h: 40, alignItems: end }
        items:
          - type: image
            box: { w: 30, h: 30 }
            src: logo.png
"#;
    let (doc, diags) = run_with_assets(yaml, json!({}), Some(&test_assets()));
    assert!(!diags.has_errors(), "{diags:?}");
    let images = image_shapes(&doc.pages[0]);
    assert_eq!(images[0].x, 0.0);
    // Text starts after the image slot + gap: 30 + 10.
    assert_eq!(cell_pos(&doc.pages[0], "aaa").0, 40.0);
    // Cross-end in the second container: x = 200 - 30.
    assert_eq!(images[1].x, 170.0);
}

#[test]
fn out_of_range_child_width_warns_once_after_dedup() {
    // The row pre-pass (`plan_row`) resolves each child's width and the
    // atom pass resolves it again; the identical `length_out_of_range`
    // warnings collapse to one at the layout output boundary.
    let child = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 3000000, h: 20 }";
    let yaml = container_body("{ x: 0, y: 0, w: 200, h: 40, direction: row }", child);
    let (_doc, diags) = run(&yaml, json!({}));
    assert_eq!(
        diags
            .iter()
            .filter(|d| d.code == "length_out_of_range")
            .count(),
        1,
        "pre-pass + atom double resolve must dedup: {diags:?}"
    );
}
