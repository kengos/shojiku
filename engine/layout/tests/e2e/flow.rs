//! Flow and absolute bodies end to end: stacking, gaps, box
//! resolution, and per-body item support.

use crate::common::*;

mod page_break;

#[test]
fn flow_stacks_items_with_gap() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    gap: 10
    items:
      - type: text
        text: first
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: text
        text: second
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(doc.pages.len(), 1);

    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts.len(), 2);
    assert_eq!(texts[0].lines[0].y, 100.0);
    // 100 (top) + 10 (first item) + 10 (gap)
    assert_eq!(texts[1].lines[0].y, 120.0);
}

#[test]
fn flow_places_rects_and_lines() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 10, y: 0, w: 400, h: 600 }
    gap: 5
    items:
      - type: rect
        box: { x: 5, w: 100, h: 40 }
        style: { borderWidth: 1, borderColor: "#336699", backgroundColor: "#eeeeee" }
      - type: rect
        box: { w: 50, h: 20 }
        style: { borderWidth: 0, backgroundColor: "#cccccc" }
      - type: line
        from: { x: 0, y: 10 }
        to: { x: 200, y: 10 }
        style: { width: 2, color: "#ff0000" }
"##,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");

    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 2);
    assert_eq!(rects[0].x, 15.0);
    assert!(rects[0].stroke.is_some());
    assert!(rects[0].fill.is_some());
    // borderWidth 0 suppresses the stroke entirely.
    assert!(rects[1].stroke.is_none());
    assert!(rects[1].fill.is_some());

    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].x1, 10.0);
    assert_eq!(lines[0].x2, 210.0);
    // 40 (rect1) + 5 (gap) + 20 (rect2) + 5 (gap) + 10 (line y)
    assert_eq!(lines[0].y1, 80.0);
    assert_eq!(lines[0].width, 2.0);
    assert_eq!(lines[0].color, (1.0, 0.0, 0.0));
}

#[test]
fn oversized_item_on_fresh_page_warns_section_overflow() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 30 }
    items:
      - type: text
        text: tall
        box: { h: 100 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "section_overflow"));
    assert_eq!(doc.pages.len(), 1);
}

#[test]
fn absolute_body_places_items() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 50, y: 200, w: 200 }
        text: fixed
      - type: line
        from: { x: 10, y: 300 }
        to: { x: 110, y: 300 }
"#,
        json!({}),
    );
    assert!(diags.is_empty());
    assert_eq!(doc.pages.len(), 1);
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].lines[0].x, 50.0);
    assert_eq!(texts[0].lines[0].y, 200.0);
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!((lines[0].y1, lines[0].y2), (300.0, 300.0));
}

#[test]
fn absolute_body_supports_rects_and_rejects_page_numbers() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { x: 10, y: 20, w: 100, h: 50 }
      - type: page_number
"#,
        json!({ "items": [] }),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    assert_eq!((rects[0].x, rects[0].y), (10.0, 20.0));
    assert!(diags.iter().any(|d| d.code == "page_number_in_body"));
}

#[test]
fn page_number_in_flow_body_warns() {
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: page_number
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "page_number_in_body"));
}

#[test]
fn flow_box_resolves_percent_of_page() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: "10%", y: "25%", w: "50%", h: "50%" }
    items:
      - type: text
        text: hi
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    assert!((texts[0].lines[0].x - 59.528).abs() < 1e-9);
    assert!((texts[0].lines[0].y - 210.4725).abs() < 1e-9);
}

#[test]
fn flow_box_out_of_range_falls_back_to_page() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 2000000, y: 3000000, w: 2500000, h: 700 }
    items:
      - type: text
        text: rescued
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert_eq!(
        diags
            .iter()
            .filter(|d| d.code == "length_out_of_range")
            .count(),
        3
    );
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!((texts[0].lines[0].x, texts[0].lines[0].y), (0.0, 0.0));
}
