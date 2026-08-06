//! Relative units end to end — deliberately cross-cutting. This root
//! holds the `em`/`rem` box-length tests (inherited-font-size basis);
//! `gap` covers the flow `gap` as a `Length`, `font` the fontSize/
//! letterSpacing length strings through the cascade.

use crate::common::*;

mod font;
mod gap;

#[test]
fn em_box_lengths_use_the_inherited_font_size() {
    // The container sets fontSize 20; the child rect's em lengths
    // resolve against it (em = the font size the item inherits).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: container
        style: { fontSize: 20 }
        box: { h: 100 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: "2em", h: "1em" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    assert_eq!((rect.w, rect.h), (40.0, 20.0));
}

#[test]
fn rem_ignores_the_cascade_and_scales_the_engine_default() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: container
        style: { fontSize: 20 }
        box: { h: 100 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: "2rem", h: "1.5rem" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    // The rem root is the engine default font size (10pt), not the
    // container's 20pt.
    assert_eq!((rect.w, rect.h), (20.0, 15.0));
}

#[test]
fn em_at_the_document_root_is_the_engine_default() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { x: 0, y: 0, w: "3em", h: "1em" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    assert_eq!((rect.w, rect.h), (30.0, 10.0));
}

#[test]
fn a_containers_own_box_resolves_em_against_its_inherited_size() {
    // Deliberate divergence from CSS (documented in docs/engine): an
    // item's own box lengths use the font size it INHERITS — the
    // container's own `fontSize: 20` applies to its children, not to
    // its own `1em` padding (resolved in the parent's context, 10pt).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: container
        style: { fontSize: 20 }
        box: { h: 100, padding: { top: "1em", left: "1em" } }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: 50, h: 10 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    assert_eq!((rect.x, rect.y), (10.0, 10.0));
}

#[test]
fn repeat_cell_children_resolve_em_against_the_cell_style() {
    // The cell's `style` is pushed before its inner basis is built (same
    // order as containers), so a cell child's em sees the cell font size.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: entries }
        grid: { columns: 1, rows: 1 }
        cell:
          style: { fontSize: 20 }
          items:
            - type: rect
              style: { borderWidth: 1 }
              box: { x: 0, y: 0, w: "2em", h: "1em" }
"#,
        json!({ "entries": [{}] }),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    assert_eq!((rect.w, rect.h), (40.0, 20.0));
}

#[test]
fn grid_tracks_take_em_lengths() {
    // Track resolution flows through the same funnel: a 2em column in a
    // fontSize-20 grid container is 40pt wide, shifting the second cell.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: container
        style: { fontSize: 20 }
        box: { h: 100, type: grid, columns: ["2em", 100] }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 10, h: 10 }
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 10, h: 10 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects[0].x, 0.0);
    assert_eq!(rects[1].x, 40.0);
}
