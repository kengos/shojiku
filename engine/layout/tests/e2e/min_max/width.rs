//! min/max width: the fill and authored width clamp, min>max order,
//! flex-row slot clamp, grid-cell child clamp, and the box index.

use crate::common::*;

/// A child rect's resolved (x, w) inside the first page.
fn rect_xw(page: &shojiku_layout::LayoutPage) -> (f64, f64) {
    let r = rect_shapes(page).into_iter().next().expect("a rect");
    (r.x, r.w)
}

#[test]
fn max_width_caps_a_containers_fill_width() {
    // No authored width → the container fills 400, but maxWidth caps it
    // to 150; a 100%-wide child then resolves against the clamped width.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { maxWidth: 150 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: "100%", h: 10 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(rect_xw(&doc.pages[0]), (0.0, 150.0));
}

#[test]
fn min_width_floors_a_narrow_authored_width() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { w: 40, minWidth: 120 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: "100%", h: 10 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // The 40pt authored width is lifted to 120 before the child fills it.
    assert_eq!(rect_xw(&doc.pages[0]), (0.0, 120.0));
}

#[test]
fn min_width_wins_over_max_width_css_order() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { w: 300, minWidth: 200, maxWidth: 100 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: "100%", h: 10 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // max 100 would cut to 100, but min 200 wins → 200.
    assert_eq!(rect_xw(&doc.pages[0]), (0.0, 200.0));
}

#[test]
fn max_width_clamps_a_fixed_flex_row_child_slot() {
    // Two fixed row children: the first authored 300 but capped to 100,
    // so the second sits at x 100 (right after the clamped slot), not
    // x 300.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { h: 50, direction: row }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 300, h: 20, maxWidth: 100 }
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 2);
    // First child clamped to 100 wide at x 0.
    assert_eq!((rects[0].x, rects[0].w), (0.0, 100.0));
    // Second child starts right after the clamped slot (x 100).
    assert_eq!(rects[1].x, 100.0);
}

#[test]
fn max_width_clamps_a_grid_cell_child() {
    // A single 200-wide grid column; a container child fills the cell but
    // maxWidth caps it to 60, so its own 100%-wide rect is 60 wide (the
    // clamp flows through the child's ResolvedBox, no grid change needed).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 400 }
    items:
      - type: container
        box: { type: grid, columns: 1, h: 50 }
        items:
          - type: container
            box: { h: 20, maxWidth: 60 }
            items:
              - type: rect
                style: { borderWidth: 1 }
                box: { x: 0, y: 0, w: "100%", h: 10 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(rect_xw(&doc.pages[0]).1, 60.0);
}

#[test]
fn clamped_width_shows_in_the_box_index() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        id: capped
        box: { w: 300, maxWidth: 90 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: 10, h: 10 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let placed = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("capped"))
        .expect("box index entry");
    // The GUI sees the effective (clamped) width, not the authored 300.
    assert_eq!(placed.border.w, 90.0);
}
