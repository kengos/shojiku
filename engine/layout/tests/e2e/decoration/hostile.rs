//! Hostile `borderRadius` / dash inputs: each pins the DEGRADED OUTPUT
//! VALUE, not merely that layout survived — non-finite geometry
//! propagates happily through a layout that produces a page and no
//! diagnostics at all.

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
fn a_negative_radius_squares_the_corners_and_warns() {
    let (doc, diags) = run_style("{ borderWidth: 1, borderRadius: -5 }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!((r.radius.rx, r.radius.ry), (0.0, 0.0));
    assert!(r.radius.is_square());
    let d = diags
        .items
        .iter()
        .find(|d| d.code == "invalid_border_radius")
        .expect("a negative radius is reported");
    assert!(d.message.contains("square corners"), "{}", d.message);
}

#[test]
fn an_enormous_radius_clamps_to_the_box_rather_than_overflowing() {
    // 1e300 is finite, so it resolves — the clamp is what bounds it, and
    // the uniform scale factor makes it half the SHORT side on both axes.
    let (doc, _) = run_style("{ borderWidth: 1, borderRadius: 1e300 }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!((r.radius.rx, r.radius.ry), (20.0, 20.0));
}

#[test]
fn a_percent_radius_that_overflows_to_infinity_squares_the_corners() {
    // "input was finite" does not make the arithmetic finite: the parser
    // admits 1e308, and 1% of it against a 500pt-wide box multiplies past
    // f64 range. (An outright infinite literal is rejected at parse.)
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 0, y: 0, w: 500, h: 40 }
        style: { borderWidth: 1, borderRadius: "1e308%" }
"##,
        json!({}),
    );
    let r = rect_shapes(&doc.pages[0])[0];
    assert!(r.radius.is_square());
    assert!(diags
        .items
        .iter()
        .any(|d| d.code == "invalid_border_radius"));
}

#[test]
fn a_near_zero_border_width_floors_the_dash_interval() {
    // Without the floor, a dotted border at this width would ask the
    // rasterizers to walk ~10^11 dash segments around the box.
    let (doc, _) = run_style("{ borderWidth: 1e-9, borderStyle: dotted }");
    let r = rect_shapes(&doc.pages[0])[0];
    // The width is positive, so the stroke exists and carries a pattern —
    // pinned at exactly the floor, not merely "no panic".
    assert_eq!(r.stroke_width, 1e-9);
    // 0.25pt = the engine's dash-interval floor (`DASH_MIN_PT`).
    assert_eq!(r.dash.map(|d| (d.on, d.off)), Some((0.25, 0.25)));
}

#[test]
fn a_dashed_border_at_the_width_cap_still_produces_finite_intervals() {
    // The clamp's admitted maximum is a boundary value: probe AT it.
    let (doc, diags) = run_style("{ borderWidth: 1000, borderStyle: dashed }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!(r.stroke_width, 1000.0);
    let dash = r.dash.expect("dashed carries a pattern");
    assert_eq!((dash.on, dash.off), (3000.0, 3000.0));
    assert!(dash.on.is_finite());
    assert!(
        !diags.items.iter().any(|d| d.code == "invalid_border_width"),
        "1000pt is the admitted maximum, not an over-cap value"
    );
}

#[test]
fn a_border_width_past_the_cap_drops_the_stroke_and_its_pattern() {
    let (doc, diags) = run_style("{ borderWidth: 1001, borderStyle: dashed }");
    let rects = rect_shapes(&doc.pages[0]);
    assert!(
        rects.is_empty() || rects.iter().all(|r| r.stroke.is_none()),
        "an over-cap width must not stroke"
    );
    assert!(diags.items.iter().any(|d| d.code == "invalid_border_width"));
}

#[test]
fn a_form_mark_refuses_a_radius_and_keeps_its_geometry() {
    let mark = |style: &str| {
        run(
            &format!(
                r##"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: checkbox
        box: {{ x: 5, y: 5, w: 12, h: 12 }}
        checked: true
        style: {style}
"##
            ),
            json!({}),
        )
    };
    let (with_radius, diags) = mark("{ borderRadius: 4 }");
    let d = diags
        .items
        .iter()
        .find(|d| d.code == "border_radius_ignored")
        .expect("a mark reports the dropped radius");
    assert!(d.message.contains("form mark"), "{}", d.message);
    // The other half of the requirement: the drawn mark is IDENTICAL to
    // an unstyled one — the refused radius changed nothing but the
    // diagnostic (the blank↔filled one-template invariant's cousin).
    let (without, _) = mark("{}");
    assert_eq!(
        serde_json::to_string(&with_radius.pages).expect("pages"),
        serde_json::to_string(&without.pages).expect("pages"),
        "a refused radius must not perturb the mark's geometry"
    );
}

#[test]
fn a_table_refuses_a_radius() {
    let (_, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        style: { borderRadius: 5 }
        columns:
          - { label: A, data: { key: a } }
"##,
        json!({ "rows": [ { "a": "1" } ] }),
    );
    let d = diags
        .items
        .iter()
        .find(|d| d.code == "border_radius_ignored")
        .expect("a table reports the dropped radius");
    assert!(d.message.contains("table"), "{}", d.message);
}
