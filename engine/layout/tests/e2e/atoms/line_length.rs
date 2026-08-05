//! `line` endpoints as full `Length`s: `%` (and `em`/`rem`/physical)
//! resolve against whatever box the line sits in, which is what lets an
//! underline span a flex child whose width nobody knows at authoring
//! time. Bare numbers stay pt — the compatibility clause.

use crate::common::*;

/// The single stroke on a page, as `(x1, y1, x2, y2)`.
fn only_line(page: &LayoutPage) -> (f64, f64, f64, f64) {
    let lines = line_shapes(page);
    assert_eq!(lines.len(), 1, "expected exactly one stroke");
    (lines[0].x1, lines[0].y1, lines[0].x2, lines[0].y2)
}

/// One line in an absolute body on a 200×200 page with no margin, so the
/// placement basis is exactly the page.
fn absolute(from: &str, to: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n      \
             - {{ type: line, from: {from}, to: {to} }}\n"
        ),
        json!({}),
    )
}

#[test]
fn a_percent_endpoint_resolves_against_the_placement_box() {
    let (doc, diags) = absolute("{ x: 0, y: \"50%\" }", "{ x: \"100%\", y: \"50%\" }");
    assert_eq!(only_line(&doc.pages[0]), (0.0, 100.0, 200.0, 100.0));
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn a_bare_number_endpoint_is_unchanged_pt() {
    // The compatibility clause, asserted on the rendered geometry rather
    // than only on the parse: every committed template is this shape.
    let (doc, _) = absolute("{ x: 10, y: 28 }", "{ x: 190, y: 28 }");
    assert_eq!(only_line(&doc.pages[0]), (10.0, 28.0, 190.0, 28.0));
}

#[test]
fn em_rem_and_physical_endpoints_resolve_like_any_other_length() {
    // The whole `Length` set reaches the endpoint, not just `%`: `em` is
    // the inherited font size (10pt default), `rem` the engine default,
    // and physical units convert with no layout context (1in = 72pt).
    let (doc, _) = absolute("{ x: \"1em\", y: \"2rem\" }", "{ x: \"1in\", y: \"2rem\" }");
    assert_eq!(only_line(&doc.pages[0]), (10.0, 20.0, 72.0, 20.0));
}

#[test]
fn a_percent_endpoint_in_a_container_spans_its_content_box() {
    // The rirekisho underline: the line sits INSIDE the flex child, so
    // `100%` is that child's resolved CONTENT width — padding inset, and
    // never the page. The child is an unsized share of a 200pt row split
    // two ways (100pt), minus 5pt padding a side: 90pt of content.
    let (doc, diags) = run(
        "page: { size: { w: 200, h: 200 }, margin: 0 }\n\
         sections:\n  body:\n    type: flow\n    items:\n      \
         - type: container\n        box: { w: 200, direction: row }\n        items:\n          \
         - type: container\n            box: { h: 40, padding: 5 }\n            items:\n              \
         - { type: line, from: { x: 0, y: 20 }, to: { x: \"100%\", y: 20 } }\n          \
         - { type: text, text: b }\n",
        json!({}),
    );
    let (x1, _, x2, _) = only_line(&doc.pages[0]);
    assert_eq!((x1, x2), (5.0, 95.0), "content box, padding inset");
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn a_percent_endpoint_in_a_flow_resolves_against_the_flow_region() {
    let (doc, _) = run(
        "page: { size: { w: 200, h: 200 }, margin: 0 }\n\
         sections:\n  body:\n    type: flow\n    box: { x: 20, y: 0, w: 100, h: 200 }\n    items:\n      \
         - { type: line, from: { x: 0, y: 4 }, to: { x: \"100%\", y: 4 } }\n",
        json!({}),
    );
    // Region x 20, width 100 — region-relative, not page-relative.
    let (x1, _, x2, _) = only_line(&doc.pages[0]);
    assert_eq!((x1, x2), (20.0, 120.0));
}

#[test]
fn a_percent_endpoint_in_a_band_resolves_against_the_page_margin_box() {
    let (doc, _) = run(
        "page: { size: { w: 200, h: 200 }, margin: 20 }\n\
         sections:\n  header:\n    items:\n      \
         - { type: line, from: { x: 0, y: 10 }, to: { x: \"100%\", y: 10 } }\n  \
         body:\n    type: flow\n    items: []\n",
        json!({}),
    );
    // Margin box: x 20, width 200 - 20 - 20 = 160, so the right end is 180.
    let (x1, _, x2, _) = only_line(&doc.pages[0]);
    assert_eq!((x1, x2), (20.0, 180.0));
}

#[test]
fn a_percent_y_under_an_auto_height_parent_warns_and_falls_back_to_zero() {
    let (doc, diags) = run(
        "page: { size: { w: 200, h: 200 }, margin: 0 }\n\
         sections:\n  body:\n    type: flow\n    items:\n      \
         - type: container\n        box: { w: 100 }\n        items:\n          \
         - { type: line, from: { x: 0, y: \"50%\" }, to: { x: \"100%\", y: \"50%\" } }\n",
        json!({}),
    );
    assert!(
        diags.iter().any(|d| d.code == "percent_of_auto"),
        "{diags:?}"
    );
    let (_, y1, _, y2) = only_line(&doc.pages[0]);
    assert_eq!((y1, y2), (0.0, 0.0), "dropped to the axis origin");
}

#[test]
fn a_hostile_percent_endpoint_is_capped_and_never_reaches_the_tree() {
    // `%` amplification is why endpoints route through the shared resolve
    // guards instead of multiplying inline.
    let (doc, diags) = absolute("{ x: 0, y: 0 }", "{ x: \"1e9%\", y: 0 }");
    assert!(
        diags.iter().any(|d| d.code == "length_out_of_range"),
        "{diags:?}"
    );
    let (_, _, x2, _) = only_line(&doc.pages[0]);
    assert!(x2.is_finite() && x2.abs() <= MAX_RESOLVED_PT, "{x2}");
    assert_eq!(x2, 0.0, "a capped endpoint falls back to the origin");
}

#[test]
fn a_line_above_its_origin_reserves_no_height_and_never_rewinds_the_flow() {
    // Negative endpoints would otherwise reserve a NEGATIVE height and
    // walk the flow cursor backwards over already-placed content.
    let (doc, _) = run(
        "page: { size: { w: 200, h: 200 }, margin: 0 }\n\
         sections:\n  body:\n    type: flow\n    items:\n      \
         - { type: rect, style: { borderWidth: 1 }, box: { w: 50, h: 20 } }\n      \
         - { type: line, from: { x: 0, y: -30 }, to: { x: 100, y: -30 } }\n      \
         - { type: rect, style: { borderWidth: 1 }, box: { w: 50, h: 20 } }\n",
        json!({}),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 2);
    // The second rect still sits below the first: the line reserved 0pt,
    // not -30.
    assert_eq!(rects[0].y, 0.0);
    assert_eq!(rects[1].y, 20.0);
}
