//! The origin shift: `x: 0` / `y: 0` mean the margin corner in every
//! walk, negative coordinates reach into the margin, and reported
//! geometry (`BoxIndex`, `LayoutOutput::margin`) stays sheet-absolute.

use crate::common::*;

#[test]
fn absolute_origin_is_the_margin_corner() {
    // Item boxes resolve against the margin-box basis, so both the text
    // block and its lines land at the margin corner.
    let (doc, diags) = run(
        r#"
page: { margin: [10, 20, 30, 40] }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 100, h: 20 }
        text: aaa
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].lines[0].x, 40.0);
    assert_eq!(texts[0].lines[0].y, 10.0);
}

#[test]
fn band_items_shift_with_the_margin() {
    let (doc, diags) = run(
        r#"
page: { margin: [10, 0, 0, 40] }
sections:
  header:
    items:
      - type: text
        box: { x: 0, y: 0, w: 100, h: 20 }
        text: aaa
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: line
        from: { x: 0, y: 30 }
        to: { x: 100, y: 30 }
        style: { width: 1 }
  body:
    type: absolute
    items: []
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!((texts[0].lines[0].x, texts[0].lines[0].y), (40.0, 10.0));
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!((lines[0].x1, lines[0].x2), (40.0, 140.0));
    assert_eq!((lines[0].y1, lines[0].y2), (40.0, 40.0));
}

#[test]
fn negative_coordinates_escape_into_the_margin() {
    let (doc, diags) = run(
        r#"
page: { margin: 25 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: -25, y: -25, w: 100, h: 20 }
        text: aaa
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: line
        from: { x: -25, y: -25 }
        to: { x: 75, y: -25 }
        style: { width: 1 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!((texts[0].lines[0].x, texts[0].lines[0].y), (0.0, 0.0));
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!((lines[0].x1, lines[0].y1), (0.0, 0.0));
}

#[test]
fn default_margin_is_25pt_everywhere() {
    let out = run_full(
        r#"
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 100, h: 20 }
        text: aaa
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert_eq!(out.margin, [25.0; 4]);
    let texts = text_blocks(&out.document.pages[0]);
    assert_eq!((texts[0].lines[0].x, texts[0].lines[0].y), (25.0, 25.0));
}

#[test]
fn box_index_reports_sheet_absolute_placements() {
    let out = run_full(
        r#"
page: { margin: [10, 0, 0, 40] }
sections:
  body:
    type: absolute
    items:
      - id: total
        type: text
        box: { x: 0, y: 0, w: 100, h: 20 }
        text: aaa
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty());
    let placed = &out.boxes.pages[0][0];
    assert_eq!(placed.id.as_deref(), Some("total"));
    assert_eq!((placed.border.x, placed.border.y), (40.0, 10.0));
}

#[test]
fn resolved_margin_is_reported_in_authored_order() {
    let out = run_full(
        r#"
page: { margin: [10, 20, 30, 40] }
sections:
  body: { type: absolute, items: [] }
"#,
        json!({}),
    );
    assert_eq!(out.margin, [10.0, 20.0, 30.0, 40.0]);
}
