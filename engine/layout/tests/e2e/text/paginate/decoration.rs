//! Decoration on pagination fragments: every fragment redraws the WHOLE
//! box (`box-decoration-break: clone`), not the first rect of it. Before
//! the paint rework a per-side border lost every side but the top — and
//! that survivor was then stretched to the fragment's height, painting a
//! solid block of border colour over the text.

use crate::common::*;

/// A 60-line flow text (two 500pt pages: 50 + 10 lines) carrying `style`.
fn decorated(style: &str) -> String {
    format!(
        r##"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 200, h: 500 }}
    items:
      - type: text
        text: "{}"
        style:
          fontSize: 10
          lineHeight: 1.0
{style}
"##,
        super::numbered_lines(60)
    )
}

/// The two fragment heights `decorated` produces.
const FRAGMENT_HEIGHTS: [f64; 2] = [500.0, 100.0];

#[test]
fn per_side_borders_keep_every_side_on_every_fragment() {
    let (doc, _) = run(
        &decorated("          borderWidth: { top: 2, right: 1, bottom: 4, left: 1 }"),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 2);
    for (page, h) in doc.pages.iter().zip(FRAGMENT_HEIGHTS) {
        let bands = rect_shapes(page);
        assert_eq!(bands.len(), 4, "top, right, bottom and left, at h={h}");
        // Top band: a 2pt band centred on the fragment's top edge.
        assert_eq!((bands[0].y, bands[0].h), (-1.0, 2.0));
        // Bottom band: centred on the fragment's OWN bottom edge — the
        // side that used to be dropped outright.
        assert_eq!((bands[2].y, bands[2].h), (h - 2.0, 4.0));
        // Left/right bands span the fragment, overlapping the corners.
        assert_eq!((bands[1].h, bands[3].h), (h + 1.0, h + 1.0));
    }
}

#[test]
fn per_side_borders_keep_the_background_underneath() {
    let (doc, _) = run(
        &decorated(
            "          backgroundColor: \"#eeeeee\"\n          borderWidth: { top: 2, right: 1, bottom: 4, left: 1 }",
        ),
        json!({}),
    );
    for (page, h) in doc.pages.iter().zip(FRAGMENT_HEIGHTS) {
        let rects = rect_shapes(page);
        assert_eq!(rects.len(), 5, "the fill plus four bands");
        // CSS paints the background under the border: the fill is first,
        // and covers the fragment's own border box exactly.
        assert_eq!(
            (rects[0].x, rects[0].y, rects[0].w, rects[0].h),
            (0.0, 0.0, 200.0, h)
        );
        assert!(rects[0].fill.is_some() && rects[0].stroke.is_none());
    }
}

#[test]
fn dashed_per_side_borders_survive_the_split() {
    // Dashed sides emit stroked centre LINES, not filled bands — which a
    // walk looking for the first `Rect` could never find at all.
    let (doc, _) = run(
        &decorated("          borderStyle: dashed\n          borderWidth: { top: 2, bottom: 4 }"),
        json!({}),
    );
    for (page, h) in doc.pages.iter().zip(FRAGMENT_HEIGHTS) {
        let lines = line_shapes(page);
        assert_eq!(lines.len(), 2, "the top and bottom dashes");
        assert!(lines.iter().all(|l| l.dash.is_some()));
        assert_eq!(lines[0].y1, 0.0, "the top dash on the fragment top");
        assert_eq!(lines[1].y1, h, "the bottom dash on the fragment bottom");
    }
}

#[test]
fn double_borders_keep_both_stripes_per_side() {
    let (doc, _) = run(
        &decorated("          borderStyle: double\n          borderWidth: 3"),
        json!({}),
    );
    for page in &doc.pages {
        assert_eq!(
            rect_shapes(page).len(),
            8,
            "two stripes on each of four sides"
        );
    }
}

#[test]
fn a_uniform_border_still_draws_as_one_rect_per_fragment() {
    // The regression pin for the fast path: one rect carrying fill and
    // stroke together, sized to the fragment.
    let (doc, _) = run(
        &decorated("          backgroundColor: \"#eeeeee\"\n          borderWidth: 1"),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 2);
    for (page, h) in doc.pages.iter().zip(FRAGMENT_HEIGHTS) {
        let rects = rect_shapes(page);
        assert_eq!(rects.len(), 1, "one decoration per fragment");
        assert_eq!(rects[0].h, h);
        assert!(rects[0].stroke.is_some() && rects[0].fill.is_some());
    }
}

#[test]
fn a_hostile_border_width_is_rejected_once_for_the_whole_block() {
    // The paint is resolved ONCE and replayed, so an out-of-range width
    // is dropped once — not re-judged (and re-warned) per fragment.
    let (doc, diags) = run(
        &decorated("          borderWidth: { top: 1e308, bottom: 4 }"),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(
        diags
            .iter()
            .filter(|d| d.code == "invalid_border_width")
            .count(),
        1,
        "one warning for the block, not one per fragment"
    );
    for (page, h) in doc.pages.iter().zip(FRAGMENT_HEIGHTS) {
        let bands = rect_shapes(page);
        assert_eq!(bands.len(), 1, "the rejected side draws nothing");
        assert_eq!((bands[0].y, bands[0].h), (h - 2.0, 4.0));
    }
}
