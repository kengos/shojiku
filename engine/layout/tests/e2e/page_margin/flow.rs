//! The flow region under the page margins: omitted `box` = the whole margin box,
//! authored boxes re-base to the margin origin, and pagination respects
//! the bottom margin.

use crate::common::*;

#[test]
fn flow_without_a_box_fills_the_margin_box() {
    let (doc, diags) = run(
        r##"
page: { margin: 25 }
sections:
  body:
    type: flow
    items:
      # Box decoration: the background rect covers the border box, so it
      # exposes the fill width.
      - type: text
        text: aaa
        box: { h: 20 }
        style: { backgroundColor: "#eeeeee" }
"##,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].y), (25.0, 25.0));
    // Fill width = A4 width minus both margins.
    assert_eq!(rects[0].w, 595.28 - 50.0);
}

#[test]
fn flow_box_resolves_against_the_margin_box() {
    let (doc, diags) = run(
        r##"
page: { margin: 25 }
sections:
  body:
    type: flow
    box: { x: 10, y: 20, w: 100, h: 200 }
    items:
      - type: text
        text: aaa
        box: { h: 20 }
        style: { backgroundColor: "#eeeeee" }
"##,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].y), (35.0, 45.0));
    assert_eq!(rects[0].w, 100.0);
}

#[test]
fn percent_flow_width_resolves_against_the_margin_box() {
    let (doc, diags) = run(
        r##"
page: { margin: [0, 45.28, 0, 50] }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: "50%", h: 200 }
    items:
      - type: text
        text: aaa
        box: { h: 20 }
        style: { backgroundColor: "#eeeeee" }
"##,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // Margin box width = 595.28 - 95.28 = 500; 50% = 250.
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects[0].w, 250.0);
    assert_eq!(rects[0].x, 50.0);
}

#[test]
fn percent_page_margin_resolves_against_the_page_width() {
    let out = run_full(
        r#"
page: { margin: { top: "10%" } }
sections:
  body: { type: absolute, items: [] }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty());
    // The CSS edge rule: every side resolves against the page *width*.
    assert!((out.margin[0] - 59.528).abs() < 1e-9, "{:?}", out.margin);
    assert_eq!(out.margin[1], 0.0);
}

#[test]
fn pagination_respects_the_bottom_margin() {
    let (doc, diags) = run(
        r#"
page: { margin: [100, 0, 100, 0] }
sections:
  body:
    type: flow
    items:
      - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 200 } }
      - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 200 } }
      - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 200 } }
      - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 200 } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // Margin box height = 841.89 - 200 = 641.89: three 200pt rects fit,
    // the fourth breaks to page 2 at the margin top.
    assert_eq!(doc.pages.len(), 2);
    let first: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(first, vec![100.0, 300.0, 500.0]);
    assert_eq!(rect_shapes(&doc.pages[1])[0].y, 100.0);
}
