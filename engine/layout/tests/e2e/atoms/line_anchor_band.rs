//! Anchored items authored in a header or footer band.
//!
//! A band is laid out once per page, so an anchored band item is deferred
//! once per page too. Each copy resolves on ITS OWN page — the first
//! placement of the id on that page — which is what makes a repeating
//! leader or ring repeat with the band rather than stacking on one page.

use crate::common::*;
use shojiku_layout::PlacedBox;

/// A 3-page document (each body rect fills a page) whose header holds a
/// `label` rect plus `header_extra`, and whose footer holds `footer_extra`.
/// The body's first rect carries `id: first`, placed on page 1 only.
fn three_pages(header_extra: &str, footer_extra: &str) -> LayoutOutput {
    let footer_extra = if footer_extra.is_empty() {
        NO_FOOTER
    } else {
        footer_extra
    };
    run_full(
        &format!(
            r#"
page: {{ size: {{ w: 200, h: 100 }}, margin: 0 }}
sections:
  header:
    items:
      - {{ type: rect, id: label, box: {{ x: 10, y: 0, w: 30, h: 10 }}, style: {{ borderWidth: 1 }} }}
{header_extra}
  footer:
    items:
{footer_extra}
  body:
    type: flow
    box: {{ x: 0, y: 20, w: 200, h: 60 }}
    items:
      - {{ type: rect, id: first, box: {{ w: 40, h: 60 }}, style: {{ borderWidth: 1 }} }}
      - {{ type: rect, box: {{ w: 40, h: 60 }}, style: {{ borderWidth: 1 }} }}
      - {{ type: rect, box: {{ w: 40, h: 60 }}, style: {{ borderWidth: 1 }} }}
"#
        ),
        json!({}),
    )
}

/// No footer item: an empty list keeps the template valid.
const NO_FOOTER: &str = "      []";

fn boxes_named<'o>(out: &'o LayoutOutput, page: usize, id: &str) -> Vec<&'o PlacedBox> {
    out.boxes.pages[page]
        .iter()
        .filter(|b| b.id.as_deref() == Some(id))
        .collect()
}

#[test]
fn a_header_leader_to_a_header_item_draws_once_on_every_page() {
    let out = three_pages(
        "      - { type: line, id: leader, from: { x: 100, y: 5 }, to: { item: label, edge: right } }",
        "",
    );
    assert_eq!(out.document.pages.len(), 3, "the body must paginate");
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    for (index, page) in out.document.pages.iter().enumerate() {
        let lines = line_shapes(page);
        assert_eq!(lines.len(), 1, "page {}: {lines:?}", index + 1);
        // The label's right edge midpoint, on this page.
        assert_eq!(
            (lines[0].x2, lines[0].y2),
            (40.0, 5.0),
            "page {}",
            index + 1
        );
        assert_eq!(
            boxes_named(&out, index, "leader").len(),
            1,
            "page {}",
            index + 1
        );
    }
}

#[test]
fn a_header_ring_around_a_header_item_draws_once_on_every_page() {
    let out = three_pages("      - { type: ellipse, id: ring, anchor: label }", "");
    for (index, page) in out.document.pages.iter().enumerate() {
        assert_eq!(path_shapes(page).len(), 1, "page {}", index + 1);
        assert_eq!(
            boxes_named(&out, index, "ring").len(),
            1,
            "page {}",
            index + 1
        );
    }
}

#[test]
fn a_footer_leader_to_a_body_item_draws_only_where_the_target_is() {
    // `first` is placed on page 1 only. The footer's copies on pages 2 and 3
    // find nothing on their own page and draw nothing — silently, because
    // the id is not unknown: it simply is not on that page.
    let out = three_pages(
        "",
        "      - { type: line, id: leader, from: { x: 100, y: 95 }, to: { item: first } }",
    );
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    let strokes: Vec<usize> = out
        .document
        .pages
        .iter()
        .map(|p| line_shapes(p).len())
        .collect();
    assert_eq!(strokes, vec![1, 0, 0]);
    let lines = line_shapes(&out.document.pages[0]);
    // `first`'s centre: x 0..40, y 20..80.
    assert_eq!((lines[0].x2, lines[0].y2), (20.0, 50.0));
}

#[test]
fn a_band_anchor_to_an_id_placed_nowhere_still_warns() {
    let out = three_pages(
        "      - { type: line, id: leader, from: { x: 100, y: 5 }, to: { item: nope } }",
        "",
    );
    assert!(out.document.pages.iter().all(|p| line_shapes(p).is_empty()));
    assert!(
        out.diagnostics
            .iter()
            .any(|d| d.code == "anchor_unknown_target"),
        "{:?}",
        out.diagnostics
    );
}

#[test]
fn a_band_anchor_is_ambiguous_only_on_its_own_page() {
    // Two `label`s in the header: every page holds both, so every copy warns
    // (deduplicated to one report) and resolves to the first.
    let out = three_pages(
        "      - { type: rect, id: label, box: { x: 150, y: 0, w: 30, h: 10 }, style: { borderWidth: 1 } }\n      \
         - { type: line, from: { x: 100, y: 5 }, to: { item: label, edge: right } }",
        "",
    );
    assert!(out
        .diagnostics
        .iter()
        .any(|d| d.code == "anchor_ambiguous_target"));
    for page in &out.document.pages {
        let lines = line_shapes(page);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].x2, 40.0, "the FIRST label wins");
    }
}

#[test]
fn a_hidden_band_leader_is_hidden_on_every_page() {
    let out = run_full(
        r#"
page: { size: { w: 200, h: 100 }, margin: 0 }
sections:
  header:
    items:
      - { type: rect, id: label, box: { x: 10, y: 0, w: 30, h: 10 }, style: { borderWidth: 1 } }
      - { type: line, id: leader, visible: { key: show }, from: { x: 100, y: 5 }, to: { item: label } }
  body:
    type: flow
    box: { x: 0, y: 20, w: 200, h: 60 }
    items:
      - { type: rect, box: { w: 40, h: 60 }, style: { borderWidth: 1 } }
      - { type: rect, box: { w: 40, h: 60 }, style: { borderWidth: 1 } }
"#,
        json!({ "show": false }),
    );
    assert_eq!(out.document.pages.len(), 2);
    for (index, page) in out.document.pages.iter().enumerate() {
        assert!(line_shapes(page).is_empty(), "page {}", index + 1);
        let leader = boxes_named(&out, index, "leader");
        assert_eq!(leader.len(), 1, "page {}", index + 1);
        assert!(leader[0].hidden);
    }
}
