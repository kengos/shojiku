//! The flow body `gap` as a `Length`: unit strings, `%` of the region
//! height, and the negative clamp.

use crate::common::*;

#[test]
fn flow_gap_takes_length_strings_and_percent() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    gap: "10pt"
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects[1].y, 30.0);

    // `%` resolves against the flow-region height (200pt → 5% = 10pt),
    // matching `repeat_flow.gap`.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    gap: "5%"
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects[1].y, 30.0);
}

#[test]
fn negative_flow_gap_clamps_to_zero() {
    // A hostile negative gap must not walk the cursor backwards into
    // already-placed content (CSS gaps are non-negative).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    gap: -50
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(rect_shapes(&doc.pages[0])[1].y, 20.0);
}
