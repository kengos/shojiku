//! Per-item-kind box emission: every leaf kind — line included — emits a
//! path-addressed placement, id-less or not, in each of its contexts.

use super::page_boxes;
use crate::common::*;

#[test]
fn flow_line_reports_its_endpoint_bbox() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: line
        from: { x: 60, y: 25 }
        to: { x: 10, y: 5 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let b = &page_boxes(&out, 0)[0];
    assert_eq!(b.path, "sections.body.items[0]");
    assert_eq!(b.id, None);
    // Endpoint bbox regardless of point order; content == border.
    assert_eq!((b.border.x, b.border.y), (10.0, 5.0));
    assert_eq!((b.border.w, b.border.h), (50.0, 20.0));
    assert_eq!(b.content, b.border);
}

#[test]
fn band_and_absolute_lines_emit_zero_thickness_boxes() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: line
        id: rule
        from: { x: 0, y: 30 }
        to: { x: 200, y: 30 }
  body:
    type: absolute
    items:
      - type: line
        from: { x: 20, y: 100 }
        to: { x: 20, y: 300 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let boxes = page_boxes(&out, 0);
    // The horizontal band rule: zero height, id alias carried.
    let rule = boxes
        .iter()
        .find(|b| b.path == "sections.header.items[0]")
        .expect("band line box");
    assert_eq!(rule.id.as_deref(), Some("rule"));
    assert_eq!((rule.border.y, rule.border.h), (30.0, 0.0));
    assert_eq!(rule.border.w, 200.0);
    // The vertical absolute-body line: zero width.
    let vline = boxes
        .iter()
        .find(|b| b.path == "sections.body.items[0]")
        .expect("absolute line box");
    assert_eq!(vline.id, None);
    assert_eq!((vline.border.x, vline.border.w), (20.0, 0.0));
    assert_eq!((vline.border.y, vline.border.h), (100.0, 200.0));
}

#[test]
fn image_marks_and_char_grid_each_emit_a_path_addressed_box() {
    let out = run_full_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: image
        src: logo.png
        box: { w: 40, h: 40 }
      - type: ellipse
        box: { w: 30, h: 20 }
      - type: checkbox
        checked: true
        box: { w: 12, h: 12 }
      - type: char_grid
        grid: { charsPerLine: 5, lines: 2, cellSize: 10 }
        text: あいうえお
"#,
        json!({}),
        &test_assets(),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let paths: Vec<&str> = page_boxes(&out, 0)
        .iter()
        .map(|b| b.path.as_str())
        .collect();
    // One box per item, all id-less, in document order.
    assert_eq!(
        paths,
        vec![
            "sections.body.items[0]",
            "sections.body.items[1]",
            "sections.body.items[2]",
            "sections.body.items[3]",
        ]
    );
    assert!(page_boxes(&out, 0).iter().all(|b| b.id.is_none()));
}
