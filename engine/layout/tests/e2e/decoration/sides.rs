//! Per-side borders: side-band geometry, `double` stripes, per-side
//! colors, and the uniform fast path staying a single stroked rect.

use crate::common::*;

fn run_style(style: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r##"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: {{ x: 10, y: 20, w: 100, h: 40 }}
        style: {style}
"##
        ),
        json!({}),
    )
}

#[test]
fn uniform_border_stays_one_stroked_rect() {
    let (doc, _) = run_style("{ borderWidth: 2 }");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    let r = rects[0];
    assert_eq!((r.x, r.y, r.w, r.h), (10.0, 20.0, 100.0, 40.0));
    assert_eq!(r.stroke_width, 2.0);
    assert!(r.stroke.is_some() && r.fill.is_none());
}

#[test]
fn per_side_borders_emit_edge_centered_bands() {
    // top 4pt + left 2pt only: two filled bands, no stroked rect.
    let (doc, _) = run_style("{ borderWidth: { top: 4, left: 2 } }");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 2);
    // Top band: centered on y=20, spans the width extended by the width.
    let top = rects[0];
    assert_eq!(
        (top.x, top.y, top.w, top.h),
        (10.0 - 2.0, 20.0 - 2.0, 104.0, 4.0)
    );
    assert!(top.fill.is_some() && top.stroke.is_none());
    // Left band: centered on x=10, spans the height extended by its width.
    let left = rects[1];
    assert_eq!(
        (left.x, left.y, left.w, left.h),
        (10.0 - 1.0, 20.0 - 1.0, 2.0, 42.0)
    );
}

#[test]
fn double_style_draws_two_thirds_stripes() {
    let (doc, _) = run_style("{ borderWidth: { bottom: 3 }, borderStyle: { bottom: double } }");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 2);
    // The 3pt band centered on y=60 splits into two 1pt stripes with a
    // 1pt gap: y 58.5..59.5 and 60.5..61.5.
    assert_eq!((rects[0].y, rects[0].h), (58.5, 1.0));
    assert_eq!((rects[1].y, rects[1].h), (60.5, 1.0));
    assert_eq!(rects[0].x, rects[1].x);
}

#[test]
fn per_side_colors_reach_their_bands() {
    let (doc, _) =
        run_style("{ borderWidth: { top: 1, bottom: 1 }, borderColor: { top: \"#ff0000\" } }");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 2);
    assert_eq!(rects[0].fill, Some((1.0, 0.0, 0.0))); // authored red
    assert_eq!(rects[1].fill, Some((0.0, 0.0, 0.0))); // unset side = black
}

#[test]
fn uniform_double_takes_the_side_band_path() {
    // A scalar width with `borderStyle: double` is not the fast path:
    // every side splits into two stripes (8 rects).
    let (doc, _) = run_style("{ borderWidth: 3, borderStyle: double }");
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 8);
}

#[test]
fn background_fill_still_paints_under_side_borders() {
    let (doc, _) = run_style("{ backgroundColor: \"#eeeeee\", borderWidth: { top: 1 } }");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 2);
    // Fill first (painting order), covering the border box exactly.
    assert!(rects[0].fill.is_some() && rects[0].stroke.is_none());
    assert_eq!((rects[0].x, rects[0].w), (10.0, 100.0));
    assert_eq!(rects[1].h, 1.0);
}
