//! Containers end to end: relative positioning, % resolution,
//! auto height, and unsupported children.

use crate::common::*;

#[test]
fn container_positions_children_relative_with_percent() {
    // A4 page: 595.28 x 841.89. Container w 50% = 297.64.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 100, y: 200, w: "50%", h: 100 }
        items:
          - type: text
            box: { x: "0%", y: "0%" }
            text: hi
            style: { fontSize: 10, lineHeight: 1.0 }
          - type: rect
            style: { borderWidth: 1 }
            box: { x: "50%", y: "50%", w: "25%", h: 10 }
          - type: line
            from: { x: 5, y: 60 }
            to: { x: 50, y: 60 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!((texts[0].lines[0].x, texts[0].lines[0].y), (100.0, 200.0));
    let rects = rect_shapes(&doc.pages[0]);
    assert!((rects[0].x - (100.0 + 148.82)).abs() < 1e-9);
    assert!((rects[0].y - 250.0).abs() < 1e-9);
    assert!((rects[0].w - 74.41).abs() < 1e-9);
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!((lines[0].x1, lines[0].y1), (105.0, 260.0));
}

#[test]
fn nested_containers_chain_percent_resolution() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 400, h: 100 }
        items:
          - type: container
            box: { x: "25%", y: "10%", w: "50%", h: "50%" }
            items:
              - type: rect
                style: { borderWidth: 1 }
                box: { x: "10%", y: "20%", w: "50%", h: "50%" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // outer 400x100 at (0,0); inner at (100,10), 200x50; rect at
    // (100+20, 10+10), 100x25.
    let rects = rect_shapes(&doc.pages[0]);
    assert!((rects[0].x - 120.0).abs() < 1e-9);
    assert!((rects[0].y - 20.0).abs() < 1e-9);
    assert!((rects[0].w - 100.0).abs() < 1e-9);
    assert!((rects[0].h - 25.0).abs() < 1e-9);
}

#[test]
fn container_auto_height_stacks_following_flow_items() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    gap: 10
    items:
      - type: container
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { y: 20, w: 100, h: 30 }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // Auto height = child bottom (20 + 30 = 50).
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].y), (25.0, 120.0));
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].lines[0].y, 160.0);
}

#[test]
fn explicit_container_height_reserves_and_overflow_warns() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    items:
      - type: container
        box: { h: 30 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 100, h: 50 }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "container_overflow"));
    // The declared 30pt is reserved, not the 50pt content.
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].lines[0].y, 130.0);
}

#[test]
fn percent_of_auto_height_container_warns_and_drops() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    items:
      - type: container
        items:
          - type: text
            box: { y: "10%" }
            text: hi
            style: { fontSize: 10, lineHeight: 1.0 }
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 100, h: "50%" }
"#,
        json!({}),
    );
    // Both the text's `%` y and the rect's `%` h resolve against the
    // auto-height container and drop; the warning is parameterless, so
    // each one is told apart by the child it names.
    let dropped: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "percent_of_auto")
        .map(|d| d.path.as_deref())
        .collect();
    assert_eq!(
        dropped,
        vec![
            Some("sections.body.items[0].items[0]"),
            Some("sections.body.items[0].items[1]")
        ]
    );
    assert!(diags.iter().any(|d| d.code == "rect_missing_size"));
    // The text's `%` y drops to 0: it sits at the container top.
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].lines[0].y, 100.0);
    assert!(rect_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn physical_units_resolve_without_a_height_basis() {
    // `mm`/`cm`/`in` are absolute: unlike `%`, they resolve inside an
    // auto-height container without a basis and without diagnostics.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    items:
      - type: container
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 10mm, y: 10mm, w: 1in, h: 1cm }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    let mm10 = 10.0 * 72.0 / 25.4;
    assert!((rects[0].x - mm10).abs() < 1e-9);
    assert!((rects[0].y - (100.0 + mm10)).abs() < 1e-9);
    assert!((rects[0].w - 72.0).abs() < 1e-9);
    assert!((rects[0].h - mm10).abs() < 1e-9);
}

#[test]
fn page_number_in_container_warns_and_skips() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: container
        items:
          - type: page_number
"#,
        json!({ "items": [{"n": 1}] }),
    );
    assert!(diags.iter().any(|d| d.code == "page_number_in_container"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn image_inside_container_translates_and_loads() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 10, y: 30, w: 200, h: 80 }
        items:
          - type: image
            box: { x: 0, y: 20, w: 20, h: 20 }
            src: logo.png
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let images = image_shapes(&doc.pages[0]);
    assert_eq!(images.len(), 1);
    assert_eq!((images[0].x, images[0].y), (10.0, 50.0));
    assert_eq!((images[0].w, images[0].h), (20.0, 20.0));
}
