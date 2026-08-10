//! Which placement an anchored endpoint resolves to, and what happens when
//! it resolves to none: the unknown id, the two-page split, and the
//! ambiguity rule (first placement on the page wins, a later page is not
//! ambiguity at all).

use crate::common::*;

/// A 200x200 page with no margin holding an absolute body: a 40x20 rect
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

/// The single stroke on a page, as `(x1, y1, x2, y2)`.
fn only_line(page: &LayoutPage) -> (f64, f64, f64, f64) {
    let lines = line_shapes(page);
    assert_eq!(lines.len(), 1, "expected exactly one stroke");
    (lines[0].x1, lines[0].y1, lines[0].x2, lines[0].y2)
}

#[test]
fn an_unknown_target_draws_nothing_and_names_the_id() {
    let (doc, diags) = with_target("{ type: line, from: { x: 0, y: 0 }, to: { item: nope } }");
    assert!(line_shapes(&doc.pages[0]).is_empty(), "must draw nothing");
    let d = diags
        .iter()
        .find(|d| d.code == "anchor_unknown_target")
        .expect("must warn");
    assert!(d.message.contains("nope"), "{d:?}");
}

#[test]
fn a_target_on_another_page_draws_nothing() {
    let (doc, diags) = run(
        r#"
page: { size: { w: 200, h: 100 }, margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 100 }
    items:
      - { type: rect, id: first, box: { w: 40, h: 80 }, style: { borderWidth: 1 } }
      - { type: rect, id: second, box: { w: 40, h: 80 }, style: { borderWidth: 1 } }
      - { type: line, from: { item: first }, to: { item: second } }
"#,
        json!({}),
    );
    assert_eq!(doc.pages.len(), 2, "the rects must paginate");
    assert!(doc.pages.iter().all(|p| line_shapes(p).is_empty()));
    assert!(
        diags.iter().any(|d| d.code == "anchor_cross_page"),
        "{diags:?}"
    );
}

#[test]
fn a_repeated_id_on_one_page_anchors_to_the_first_and_warns() {
    let (doc, diags) = run(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: dup, box: { x: 0, y: 0, w: 20, h: 20 }, style: { borderWidth: 1 } }
      - { type: rect, id: dup, box: { x: 100, y: 100, w: 20, h: 20 }, style: { borderWidth: 1 } }
      - { type: line, from: { x: 0, y: 50 }, to: { item: dup } }
"#,
        json!({}),
    );
    // The FIRST placement's geometry, not merely "some" placement.
    assert_eq!(only_line(&doc.pages[0]), (0.0, 50.0, 10.0, 10.0));
    let d = diags
        .iter()
        .find(|d| d.code == "anchor_ambiguous_target")
        .expect("must warn");
    assert!(d.message.contains("dup"), "{d:?}");
}

#[test]
fn the_same_id_on_a_later_page_is_not_ambiguous() {
    // One placement per page is the ordinary case for a band item or a
    // repeated section — only a SECOND placement on the anchor's own page
    // is ambiguous.
    let (doc, diags) = run(
        r#"
page: { size: { w: 200, h: 100 }, margin: 0 }
sections:
  header:
    items:
      - { type: rect, id: stamp, box: { x: 0, y: 0, w: 20, h: 10 }, style: { borderWidth: 1 } }
  body:
    type: flow
    box: { x: 0, y: 20, w: 200, h: 70 }
    items:
      - { type: rect, box: { w: 40, h: 60 }, style: { borderWidth: 1 } }
      - { type: rect, box: { w: 40, h: 60 }, style: { borderWidth: 1 } }
      - { type: line, from: { x: 0, y: 0 }, to: { item: stamp } }
"#,
        json!({}),
    );
    assert_eq!(doc.pages.len(), 2, "the body must paginate");
    // The header's `stamp` is placed on BOTH pages; the line resolves to the
    // first without warning.
    assert!(
        !diags.iter().any(|d| d.code == "anchor_ambiguous_target"),
        "{diags:?}"
    );
    assert_eq!(line_shapes(&doc.pages[0]).len(), 1);
}

#[test]
fn an_unresolvable_start_endpoint_stops_the_line_too() {
    // The `to` half is the one every other case exercises; a leader whose
    // START names a missing id must fail the same way, not draw from 0,0.
    let (doc, diags) = with_target("{ type: line, from: { item: nope }, to: { x: 10, y: 10 } }");
    assert!(line_shapes(&doc.pages[0]).is_empty(), "must draw nothing");
    assert!(diags.iter().any(|d| d.code == "anchor_unknown_target"));
}

#[test]
fn a_mixed_lines_coordinate_half_resolves_against_the_page_margin_box() {
    // D10's own rule, and the only one every other fixture hides: with
    // `margin: 0` the margin-box rule and the sheet-origin rule agree, so
    // this is the case that tells them apart.
    let (doc, diags) = run(
        r#"
page: { size: { w: 200, h: 200 }, margin: { top: 30, left: 20, right: 5, bottom: 5 } }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: target, box: { x: 100, y: 100, w: 40, h: 20 }, style: { borderWidth: 1 } }
      - { type: line, from: { x: 10, y: 10 }, to: { item: target } }
"#,
        json!({}),
    );
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 1);
    // The coordinate half sits at (left + 10, top + 10) in SHEET space…
    assert_eq!((lines[0].x1, lines[0].y1), (30.0, 40.0));
    // …and the anchored half is the target's centre, itself margin-shifted:
    // the rect's box is margin-box (100, 100), so its centre is
    // (20 + 120, 30 + 110).
    assert_eq!((lines[0].x2, lines[0].y2), (140.0, 140.0));
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn a_collapsed_anchored_line_emits_neither_box_nor_stroke() {
    // Requirement 32's second clause. Correct by construction — every walk
    // `continue`s before the atom is built — which is exactly the kind of
    // claim that rots unpinned.
    let out = run_full(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: target, box: { x: 100, y: 100, w: 40, h: 20 }, style: { borderWidth: 1 } }
      - type: line
        id: leader
        visible: { key: show, collapse: true }
        from: { x: 0, y: 0 }
        to: { item: target }
"#,
        json!({ "show": false }),
    );
    assert!(line_shapes(&out.document.pages[0]).is_empty(), "no stroke");
    assert!(
        !out.boxes.pages[0]
            .iter()
            .any(|b| b.id.as_deref() == Some("leader")),
        "a collapsed item reports no placement at all"
    );
}

#[test]
fn an_offset_past_the_resolve_cap_drops_the_item_and_warns() {
    // The offset is the one endpoint value that never passes through
    // `resolve_x`/`_y`, so without its own cap it would reach the render
    // boundary — where `1e300f64 as f32` is INFINITY and the backend drops
    // the stroke with nothing said.
    let (doc, diags) = run(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: target, box: { x: 10, y: 10, w: 20, h: 20 }, style: { borderWidth: 1 } }
      - { type: line, from: { x: 0, y: 0 }, to: { item: target, offset: { x: 1e300 } } }
"#,
        json!({}),
    );
    assert!(line_shapes(&doc.pages[0]).is_empty(), "must not be drawn");
    assert!(
        diags.iter().any(|d| d.code == "length_out_of_range"),
        "must warn like every other over-range length: {diags:?}"
    );
}
