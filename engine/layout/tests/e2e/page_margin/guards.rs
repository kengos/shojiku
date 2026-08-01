//! Hostile page margins: axis clamps (`page_margin_too_large`), the
//! resolve cap, and the cross-walk uniformity of the origin shift.

use crate::common::*;

fn has_code(diags: &Diagnostics, code: &str) -> bool {
    diags.iter().any(|d| d.code == code)
}

#[test]
fn horizontal_margins_consuming_the_page_fall_back_to_zero() {
    let out = run_full(
        r#"
page: { margin: [10, 300, 10, 300] }
sections:
  body:
    type: absolute
    items:
      - { type: rect, style: { borderWidth: 1 }, box: { x: 0, y: 0, w: 100, h: 20 } }
"#,
        json!({}),
    );
    assert!(has_code(&out.diagnostics, "page_margin_too_large"));
    // The horizontal axis falls back to 0; the vertical one is kept.
    assert_eq!(out.margin, [10.0, 0.0, 10.0, 0.0]);
    assert_eq!(rect_shapes(&out.document.pages[0])[0].x, 0.0);
}

#[test]
fn vertical_margins_consuming_the_page_fall_back_to_zero() {
    let out = run_full(
        r#"
page: { margin: [500, 10, 400, 10] }
sections:
  body: { type: absolute, items: [] }
"#,
        json!({}),
    );
    assert!(has_code(&out.diagnostics, "page_margin_too_large"));
    assert_eq!(out.margin, [0.0, 10.0, 0.0, 10.0]);
}

#[test]
fn margin_side_past_the_resolve_cap_drops_to_zero() {
    let out = run_full(
        r#"
page: { margin: [2000000, 0, 0, 0] }
sections:
  body: { type: absolute, items: [] }
"#,
        json!({}),
    );
    assert!(has_code(&out.diagnostics, "length_out_of_range"));
    assert_eq!(out.margin, [0.0; 4]);
}

#[test]
fn degenerate_margins_with_no_flow_box_still_terminate() {
    // Both axes clamp; the flow (no `box`) then fills the whole page and
    // lays out normally.
    let out = run_full(
        r#"
page: { margin: [500, 300, 400, 300] }
sections:
  body:
    type: flow
    items:
      - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 20 } }
"#,
        json!({}),
    );
    assert!(has_code(&out.diagnostics, "page_margin_too_large"));
    assert_eq!(out.margin, [0.0; 4]);
    let rects = rect_shapes(&out.document.pages[0]);
    assert_eq!((rects[0].x, rects[0].y), (0.0, 0.0));
}

/// The one net that catches a walk missing the shift: the same template
/// run with and without margins must differ by exactly the margin
/// offset, item for item, across flow text, tables, rects, and lines.
#[test]
fn margin_shift_is_uniform_across_walks() {
    let template = |page: &str| {
        format!(
            r#"
{page}
sections:
  header:
    items:
      - {{ type: text, box: {{ x: 5, y: 0, w: 200, h: 14 }}, text: head,
          style: {{ fontSize: 10, lineHeight: 1.0 }} }}
  body:
    type: flow
    items:
      - {{ type: text, text: body }}
      - {{ type: rect, style: {{ borderWidth: 1 }}, box: {{ w: 50, h: 20 }} }}
      - type: table
        data: {{ key: rows }}
        columns:
          - {{ label: A, data: {{ key: a }}, width: 100 }}
"#
        )
    };
    let (zero, d0) = run(
        &template("page: { margin: 0 }"),
        json!({"rows": [{"a": "x"}]}),
    );
    let (shifted, d1) = run(
        &template("page: { margin: [15, 0, 0, 35] }"),
        json!({"rows": [{"a": "x"}]}),
    );
    assert!(d0.is_empty() && d1.is_empty(), "{d0:?} {d1:?}");

    let t0 = text_blocks(&zero.pages[0]);
    let t1 = text_blocks(&shifted.pages[0]);
    assert_eq!(t0.len(), t1.len());
    for (a, b) in t0.iter().zip(&t1) {
        for (la, lb) in a.lines.iter().zip(&b.lines) {
            assert_eq!((la.x + 35.0, la.y + 15.0), (lb.x, lb.y), "{}", la.text);
        }
    }
    let r0 = rect_shapes(&zero.pages[0]);
    let r1 = rect_shapes(&shifted.pages[0]);
    assert_eq!(r0.len(), r1.len());
    for (a, b) in r0.iter().zip(&r1) {
        assert_eq!((a.x + 35.0, a.y + 15.0), (b.x, b.y));
    }
    let l0 = line_shapes(&zero.pages[0]);
    let l1 = line_shapes(&shifted.pages[0]);
    assert_eq!(l0.len(), l1.len());
    for (a, b) in l0.iter().zip(&l1) {
        assert_eq!((a.x1 + 35.0, a.y1 + 15.0), (b.x1, b.y1));
        assert_eq!((a.x2 + 35.0, a.y2 + 15.0), (b.x2, b.y2));
    }
}
