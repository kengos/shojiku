//! Grid spans end to end: columnSpan/rowSpan cell runs, span
//! clamping, and the outside-a-grid warning.

use crate::common::*;

#[test]
fn column_span_widens_the_child_across_tracks() {
    // 3 equal 100pt tracks, 10pt gaps: a 2-span child = 210pt wide.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 320, type: grid, columns: 3, columnGap: 10 }
        items:
          - { type: rect, style: { borderWidth: 1 }, box: { w: 10, h: 10, columnSpan: 2 } }
          - { type: rect, style: { borderWidth: 1 }, box: { w: 10, h: 10 } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "{diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    // Rects keep their authored size; the span affects the CELL, so the
    // second child starts in track 3 (x = 2*(100+10) = 220).
    assert_eq!(rects[1].x, 220.0);
}

#[test]
fn row_span_reserves_the_cells_beneath() {
    // 2 columns; first child spans 2 rows: children 2 and 3 stack in
    // column 2, child 4 lands under the spanning child.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, type: grid, columns: 2 }
        items:
          - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 60, rowSpan: 2 } }
          - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 20 } }
          - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 20 } }
          - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 20 } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "{diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].y), (0.0, 0.0));
    assert_eq!((rects[1].x, rects[1].y), (100.0, 0.0));
    assert_eq!((rects[2].x, rects[2].y), (100.0, 20.0));
    // Row 0 is 20pt (tallest single-row child), the spanning child pours
    // its leftover 40pt into row 1; child 4 starts at row 2 = y 60.
    assert_eq!((rects[3].x, rects[3].y), (0.0, 60.0));
}

#[test]
fn hostile_spans_clamp_with_a_diagnostic() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 300, type: grid, columns: 3, columnGap: 0 }
        items:
          - { type: rect, style: { borderWidth: 1 }, box: { w: 10, h: 10, columnSpan: 1000000 } }
"#,
        json!({}),
    );
    assert!(
        diags.iter().any(|d| d.code == "grid_span_clamped"),
        "{diags:?}"
    );
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1);
}

#[test]
fn span_keys_outside_a_grid_warn_and_are_inert() {
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 300 }
        items:
          - { type: rect, style: { borderWidth: 1 }, box: { w: 10, h: 10, columnSpan: 2 } }
"#,
        json!({}),
    );
    assert!(
        diags.iter().any(|d| d.code == "span_outside_grid"),
        "{diags:?}"
    );
}

#[test]
fn row_span_over_explicit_tracks_warns_on_overflow() {
    // Two explicit 20pt rows; a rowSpan-2 child is 60pt tall: the 40pt
    // (+0 gap) spanned budget overflows with a diagnostic.
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, h: 40, type: grid, columns: 2, rows: [20, 20] }
        items:
          - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 60, rowSpan: 2 } }
"#,
        json!({}),
    );
    assert!(
        diags.iter().any(|d| d.code == "grid_cell_overflow"),
        "{diags:?}"
    );
}
