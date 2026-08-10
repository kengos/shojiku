//! `line` endpoints anchored to another item (`from: { item: … }`).
//!
//! Anchoring makes a line absolutely positioned: it reserves no height in
//! the flow, draws nothing during the walk, and is resolved against the
//! finished page — on the page its TARGET landed on, painted after that
//! page's in-flow content.

use crate::common::*;

/// A 200×200 page with no margin holding an absolute body: a 40×20 rect
/// with `id: target` at (100, 100), plus whatever line the case authors.
fn with_target(line: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n      \
             - {{ type: rect, id: target, box: {{ x: 100, y: 100, w: 40, h: 20 }}, \
             style: {{ borderWidth: 1 }} }}\n      \
             - {line}\n"
        ),
        json!({}),
    )
}

/// [`with_target`] keeping the box index.
fn with_target_full(line: &str) -> LayoutOutput {
    run_full(
        &format!(
            "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n      \
             - {{ type: rect, id: target, box: {{ x: 100, y: 100, w: 40, h: 20 }}, \
             style: {{ borderWidth: 1 }} }}\n      \
             - {line}\n"
        ),
        json!({}),
    )
}

/// The single stroke on a page, as `(x1, y1, x2, y2)`.
fn only_line(page: &LayoutPage) -> (f64, f64, f64, f64) {
    let lines = line_shapes(page);
    assert_eq!(lines.len(), 1, "expected exactly one stroke");
    (lines[0].x1, lines[0].y1, lines[0].x2, lines[0].y2)
}

#[test]
fn an_anchored_endpoint_lands_on_the_target_centre() {
    let (doc, diags) = with_target("{ type: line, from: { x: 0, y: 0 }, to: { item: target } }");
    // The rect spans x 100..140, y 100..120 — its centre is (120, 110).
    assert_eq!(only_line(&doc.pages[0]), (0.0, 0.0, 120.0, 110.0));
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn every_edge_keyword_picks_its_own_point_on_the_target() {
    for (edge, want) in [
        ("top", (120.0, 100.0)),
        ("right", (140.0, 110.0)),
        ("bottom", (120.0, 120.0)),
        ("left", (100.0, 110.0)),
        ("center", (120.0, 110.0)),
    ] {
        let (doc, diags) = with_target(&format!(
            "{{ type: line, from: {{ x: 0, y: 0 }}, to: {{ item: target, edge: {edge} }} }}"
        ));
        let (_, _, x2, y2) = only_line(&doc.pages[0]);
        assert_eq!((x2, y2), want, "edge `{edge}`");
        assert!(diags.is_empty(), "edge `{edge}`: {diags:?}");
    }
}

#[test]
fn an_offset_shifts_the_resolved_point_by_exactly_that_many_points() {
    let (doc, _) = with_target(
        "{ type: line, from: { x: 0, y: 0 }, \
         to: { item: target, edge: top, offset: { x: 4, y: -2 } } }",
    );
    assert_eq!(only_line(&doc.pages[0]), (0.0, 0.0, 124.0, 98.0));
}

#[test]
fn both_endpoints_may_be_anchored() {
    let (doc, diags) = run(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: a, box: { x: 0, y: 0, w: 20, h: 20 }, style: { borderWidth: 1 } }
      - { type: rect, id: b, box: { x: 100, y: 100, w: 20, h: 20 }, style: { borderWidth: 1 } }
      - { type: line, from: { item: a }, to: { item: b } }
"#,
        json!({}),
    );
    assert_eq!(only_line(&doc.pages[0]), (10.0, 10.0, 110.0, 110.0));
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn an_anchored_line_in_a_flow_reserves_no_height() {
    // The floor-at-0 rule, one step further: an anchored line's endpoints
    // are unknown at flow time, so it takes the flow cursor nowhere and
    // the text below it sits exactly where it would with no line at all.
    let with =
        flow_two_rects("- { type: line, from: { x: 0, y: 0 }, to: { item: target } }\n      ");
    let without = flow_two_rects("");
    assert_eq!(with, without, "the anchored line moved the flow cursor");
}

/// Two 20pt rects in a flow, with `extra` authored between them; returns
/// the y of the second rect's placement.
fn flow_two_rects(extra: &str) -> f64 {
    let out = run_full(
        &format!(
            "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 200, h: 200 }}\n    \
             items:\n      \
             - {{ type: rect, id: target, box: {{ w: 40, h: 20 }}, style: {{ borderWidth: 1 }} }}\n      \
             {extra}- {{ type: rect, id: below, box: {{ w: 40, h: 20 }}, style: {{ borderWidth: 1 }} }}\n"
        ),
        json!({}),
    );
    out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("below"))
        .expect("the second rect is placed")
        .border
        .y
}

#[test]
fn anchored_lines_paint_after_the_pages_in_flow_content() {
    // CSS 2.1 Appendix E paints positioned content above in-flow content,
    // and an anchor-positioned box is positioned by definition. Asserted
    // on the INDEX, not on presence: painting order is the whole claim.
    let (doc, _) = with_target("{ type: line, from: { x: 0, y: 0 }, to: { item: target } }");
    let items = &doc.pages[0].items;
    let last = items.last().expect("the page has items");
    assert!(
        matches!(last, LayoutItem::Line(_)),
        "the anchored line must be last, got {items:?}"
    );
    assert!(items.len() > 1, "the rect's decoration is still there");
}

#[test]
fn the_placement_carries_the_resolved_endpoints() {
    // Without this the Designer would have to re-resolve anchors in
    // TypeScript — a second copy of the rule.
    let out =
        with_target_full("{ type: line, id: leader, from: { x: 0, y: 0 }, to: { item: target } }");
    let b = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("leader"))
        .expect("the anchored line reports a placement");
    assert_eq!((b.border.x, b.border.y), (0.0, 0.0));
    assert_eq!((b.border.w, b.border.h), (120.0, 110.0));
}

#[test]
fn a_hidden_target_still_anchors_but_a_collapsed_one_does_not() {
    // CSS `visibility: hidden` keeps the box, so it stays anchorable;
    // `display: none` (our `collapse`) has no box at all, which reaches
    // the anchor as an unknown id — by construction, not by a check.
    for (visible, code) in [
        ("{ key: show }", None),
        (
            "{ key: show, collapse: true }",
            Some("anchor_unknown_target"),
        ),
    ] {
        let (doc, diags) = run(
            &format!(
                "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
                 sections:\n  body:\n    type: absolute\n    items:\n      \
                 - {{ type: rect, id: target, visible: {visible}, \
                 box: {{ x: 100, y: 100, w: 40, h: 20 }}, style: {{ borderWidth: 1 }} }}\n      \
                 - {{ type: line, from: {{ x: 0, y: 0 }}, to: {{ item: target }} }}\n"
            ),
            json!({ "show": false }),
        );
        match code {
            None => assert_eq!(only_line(&doc.pages[0]), (0.0, 0.0, 120.0, 110.0)),
            Some(code) => {
                assert!(line_shapes(&doc.pages[0]).is_empty());
                assert!(diags.iter().any(|d| d.code == code), "{diags:?}");
            }
        }
    }
}

#[test]
fn a_hidden_anchored_line_reports_its_placement_and_paints_nothing() {
    let out = run_full(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: target, box: { x: 100, y: 100, w: 40, h: 20 }, style: { borderWidth: 1 } }
      - { type: line, id: leader, visible: { key: show }, from: { x: 0, y: 0 }, to: { item: target } }
"#,
        json!({ "show": false }),
    );
    assert!(
        line_shapes(&out.document.pages[0]).is_empty(),
        "must not paint"
    );
    let b = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("leader"))
        .expect("a hidden item still reports where it would have drawn");
    assert!(b.hidden, "the placement must be stamped hidden");
    assert_eq!((b.border.w, b.border.h), (120.0, 110.0));
}

#[test]
fn two_runs_over_the_same_input_produce_the_same_tree() {
    // The drain introduces an ordering the walk did not have (anchored
    // items are appended per page, after everything else), so determinism
    // is re-proved here rather than inherited.
    let template = r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: a, box: { x: 0, y: 0, w: 20, h: 20 }, style: { borderWidth: 1 } }
      - { type: rect, id: b, box: { x: 100, y: 100, w: 20, h: 20 }, style: { borderWidth: 1 } }
      - { type: line, from: { item: a }, to: { item: b } }
      - { type: line, from: { x: 0, y: 0 }, to: { item: b, edge: left } }
      - { type: ellipse, anchor: a }
"#;
    let first = serde_json::to_string(&run(template, json!({})).0).expect("serialize");
    let second = serde_json::to_string(&run(template, json!({})).0).expect("serialize");
    assert_eq!(first, second);
}

#[test]
fn an_anchored_double_line_still_splits_into_two_strokes() {
    // `style: double` derives its split from the RESOLVED endpoints, so the
    // deferred path has to apply it after resolution, not before.
    let (doc, _) = with_target(
        "{ type: line, from: { x: 0, y: 0 }, to: { item: target }, style: { style: double, width: 3 } }",
    );
    assert_eq!(line_shapes(&doc.pages[0]).len(), 2);
}

#[test]
fn a_parked_measure_pass_does_not_duplicate_a_deferred_anchor() {
    // An auto-height `direction: row` with the default `alignItems: stretch`
    // measures every child once and throws the placement away. A deferred
    // anchor pushed during that pass must be thrown away with it — it is
    // walk-global state, and `end_measure` parks only the diagnostics.
    let (doc, _) = run(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: text, id: answer, text: "AB", box: { x: 20, y: 20, w: 120, h: 30 }, style: { fontSize: 20 } }
      - type: container
        box: { x: 0, y: 100, w: 200, direction: row }
        items:
          - { type: ellipse, id: ring, anchor: answer }
          - { type: line, id: leader, from: { x: 0, y: 0 }, to: { item: answer } }
"#,
        json!({}),
    );
    let ovals = doc.pages[0]
        .items
        .iter()
        .filter(|i| matches!(i, LayoutItem::Path(_)))
        .count();
    assert_eq!(
        (ovals, line_shapes(&doc.pages[0]).len()),
        (1, 1),
        "the parked measure pass duplicated the deferred items"
    );
}
