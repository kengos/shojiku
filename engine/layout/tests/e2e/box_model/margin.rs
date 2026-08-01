//! `box.margin`: outer spacing in flow stacks, absolute bodies, and
//! containers — additive with `gap` (no collapse), negative allowed,
//! hostile values capped.

use crate::common::*;

mod cells;

#[test]
fn flow_margins_space_siblings_additively_with_gap() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    gap: 5
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20, margin: { bottom: 10 } }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20, margin: { top: 8 } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects[0].y, 100.0);
    // 100 + 20 (rect) + 10 (bottom margin) + 5 (gap) + 8 (top margin).
    assert_eq!(rects[1].y, 143.0);
}

#[test]
fn top_margin_applies_even_on_a_fresh_page() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20, margin: { top: 12 } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(rect_shapes(&doc.pages[0])[0].y, 112.0);
}

#[test]
fn horizontal_margins_shift_and_shrink_the_default_width() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 10, y: 0, w: 300, h: 600 }
    items:
      - type: text
        text: wide
        box: { margin: { right: 40, left: 60 } }
        style: { fontSize: 10, lineHeight: 1.0, backgroundColor: "#eeeeee" }
"##,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let bg = rect_shapes(&doc.pages[0])[0];
    assert_eq!((bg.x, bg.w), (70.0, 200.0));
}

#[test]
fn absolute_margin_offsets_the_box() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: off
        box: { x: 10, y: 20, w: 100, margin: { top: 7, left: 9 } }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let line = &text_blocks(&doc.pages[0])[0].lines[0];
    assert_eq!((line.x, line.y), (19.0, 27.0));
}

#[test]
fn container_auto_height_includes_child_bottom_margin() {
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
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 10, margin: { bottom: 6 } }
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 116.0);
}

#[test]
fn negative_top_margin_overlaps_the_previous_item() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    gap: 0
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20, margin: { top: -10 } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(rect_shapes(&doc.pages[0])[1].y, 110.0);
}

#[test]
fn hostile_negative_margins_clamp_the_atom_height_at_zero() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    gap: 0
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 5, margin: { top: -50, bottom: -50 } }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 7 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(doc.pages.len(), 1);
    let rects = rect_shapes(&doc.pages[0]);
    // The clamped zero-height atom keeps the cursor monotonic: the third
    // rect lands exactly where the second one started.
    assert_eq!(rects[1].y, 70.0);
    assert_eq!(rects[2].y, 120.0);
}

#[test]
fn margins_count_toward_pagination() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 100 }
    gap: 0
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 60 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 30, margin: { top: 30 } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    // 60 + (30 + 30) exceeds the 100pt region: the margin breaks the page.
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(rect_shapes(&doc.pages[1])[0].y, 30.0);
}

#[test]
fn out_of_range_percent_margin_is_dropped() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 500, h: 600 }
    items:
      - type: text
        text: capped
        box: { margin: { top: "300000%" } }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "length_out_of_range"));
    // The hostile margin falls back to 0, not to a poisoned offset.
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 100.0);
}

#[test]
fn physical_unit_margins_resolve_absolutely() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20, margin: { top: 1in } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(rect_shapes(&doc.pages[0])[0].y, 172.0);
}

#[test]
fn image_margin_shifts_the_draw_rect() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: image
        box: { w: 30, h: 30, margin: { left: 6 } }
        src: logo.png
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(image_shapes(&doc.pages[0])[0].x, 6.0);
}
