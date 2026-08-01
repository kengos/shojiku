//! Patterned borders (`borderStyle: dashed | dotted`) and corner
//! rounding (`borderRadius`) end to end: which tree primitive carries
//! the pattern, the per-axis `%` radius rule, and the contexts that
//! refuse a radius.

use crate::common::*;

/// An absolutely-placed 100×40 text box carrying `style`.
fn run_style(style: &str) -> (LayoutDocument, Diagnostics) {
    run_sized(style, 100.0, 40.0)
}

fn run_sized(style: &str, w: f64, h: f64) -> (LayoutDocument, Diagnostics) {
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
        box: {{ x: 10, y: 20, w: {w}, h: {h} }}
        style: {style}
"##
        ),
        json!({}),
    )
}

#[test]
fn a_uniform_dashed_border_stays_one_rect_carrying_the_pattern() {
    let (doc, _) = run_style("{ borderWidth: 2, borderStyle: dashed }");
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1, "the uniform fast path must survive dashing");
    let dash = rects[0].dash.expect("dashed carries a pattern");
    // Three stroke widths on, three off.
    assert_eq!((dash.on, dash.off), (6.0, 6.0));
    assert_eq!(rects[0].stroke_width, 2.0);
}

#[test]
fn a_uniform_dotted_border_uses_one_width_per_interval() {
    let (doc, _) = run_style("{ borderWidth: 2, borderStyle: dotted }");
    let dash = rect_shapes(&doc.pages[0])[0]
        .dash
        .expect("dotted carries a pattern");
    assert_eq!((dash.on, dash.off), (2.0, 2.0));
}

#[test]
fn a_solid_border_carries_no_pattern() {
    let (doc, _) = run_style("{ borderWidth: 2 }");
    assert!(rect_shapes(&doc.pages[0])[0].dash.is_none());
}

#[test]
fn a_dashed_side_of_a_per_side_border_becomes_a_dashed_line() {
    // Mixed sides drop to the band path; a dashed side cannot be a
    // filled band (the gaps are the point), so it strokes a centre line.
    let (doc, _) = run_style("{ borderWidth: 2, borderStyle: { top: dashed, bottom: solid } }");
    let page = &doc.pages[0];
    let lines = line_shapes(page);
    assert_eq!(lines.len(), 1, "only the dashed side becomes a line");
    let top = lines[0];
    // Centred on the top edge (y = 20), spanning the width plus the
    // stroke, exactly where the solid band would have sat.
    assert_eq!((top.y1, top.y2), (20.0, 20.0));
    assert_eq!((top.x1, top.x2), (9.0, 111.0));
    assert_eq!(top.width, 2.0);
    assert_eq!(top.dash.map(|d| (d.on, d.off)), Some((6.0, 6.0)));
    // The three non-dashed sides keep their filled bands.
    assert_eq!(rect_shapes(page).len(), 3);
}

#[test]
fn a_dotted_vertical_side_strokes_down_the_edge() {
    // The horizontal and vertical sides build their centre line from
    // different axes of the band, so both need a case.
    let (doc, _) = run_style("{ borderWidth: 2, borderStyle: { left: dotted } }");
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 1);
    let left = lines[0];
    // Centred on the left edge (x = 10), running the height plus the stroke.
    assert_eq!((left.x1, left.x2), (10.0, 10.0));
    assert_eq!((left.y1, left.y2), (19.0, 61.0));
    assert_eq!(left.dash.map(|d| (d.on, d.off)), Some((2.0, 2.0)));
}

#[test]
fn a_four_way_style_mix_emits_per_side_bands_and_lines() {
    // The plan's literal mix: every keyword on one box. Solid keeps its
    // filled band, double its two stripes, and each patterned side is a
    // centred line — five filled rects + two dashed/dotted lines.
    let (doc, _) = run_style(
        "{ borderWidth: 3, borderStyle: { top: solid, right: dashed, bottom: double, left: dotted } }",
    );
    let page = &doc.pages[0];
    let rects = rect_shapes(page);
    let lines = line_shapes(page);
    assert_eq!(rects.len(), 3, "one solid band + two double stripes");
    assert_eq!(lines.len(), 2, "the dashed and dotted sides");
    // Right side (dashed): vertical centre line on x = 110, 3×3 pattern.
    let right = lines.iter().find(|l| l.x1 == 110.0).expect("dashed right");
    assert_eq!(right.dash.map(|d| (d.on, d.off)), Some((9.0, 9.0)));
    // Left side (dotted): vertical centre line on x = 10, 1×1 pattern.
    let left = lines.iter().find(|l| l.x1 == 10.0).expect("dotted left");
    assert_eq!(left.dash.map(|d| (d.on, d.off)), Some((3.0, 3.0)));
    // The double stripes are thirds of the bottom band (h = 1 each).
    let stripes: Vec<_> = rects.iter().filter(|r| r.h == 1.0).collect();
    assert_eq!(stripes.len(), 2);
}

#[test]
fn a_radius_lands_on_the_rect_in_points() {
    let (doc, diags) = run_style("{ borderWidth: 1, borderRadius: 6 }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!((r.radius.rx, r.radius.ry), (6.0, 6.0));
    assert!(diags.items.is_empty(), "{:?}", diags.items);
}

#[test]
fn an_em_radius_resolves_against_the_items_own_font_size() {
    let (doc, _) = run_style("{ borderWidth: 1, fontSize: 12, borderRadius: 0.5em }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!((r.radius.rx, r.radius.ry), (6.0, 6.0));
}

#[test]
fn a_percent_radius_resolves_each_axis_against_its_own_side() {
    // The elliptical case: a 100×40 box at 25% is 25pt across and 10 down.
    let (doc, _) = run_style("{ borderWidth: 1, borderRadius: \"25%\" }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!((r.radius.rx, r.radius.ry), (25.0, 10.0));
}

#[test]
fn fifty_percent_of_a_square_box_is_a_circle() {
    let (doc, _) = run_sized("{ borderWidth: 1, borderRadius: \"50%\" }", 40.0, 40.0);
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!((r.radius.rx, r.radius.ry), (20.0, 20.0));
}

#[test]
fn an_oversized_radius_scales_uniformly_into_a_stadium() {
    // CSS shrinks every radius by ONE factor, so an over-large absolute
    // radius on an oblong box is a pill (rx == ry == half the short
    // side), not an ellipse.
    let (doc, _) = run_style("{ borderWidth: 1, borderRadius: 999 }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!((r.radius.rx, r.radius.ry), (20.0, 20.0));
}

#[test]
fn a_radius_rounds_a_fill_with_no_border_at_all() {
    let (doc, _) = run_style("{ backgroundColor: \"#eeeeee\", borderRadius: 5 }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert!(r.stroke.is_none() && r.fill.is_some());
    assert_eq!((r.radius.rx, r.radius.ry), (5.0, 5.0));
}

#[test]
fn a_dashed_border_and_a_percent_radius_coexist_on_one_rect() {
    let (doc, _) = run_style("{ borderWidth: 1, borderStyle: dashed, borderRadius: \"25%\" }");
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!(r.dash.map(|d| (d.on, d.off)), Some((3.0, 3.0)));
    assert_eq!((r.radius.rx, r.radius.ry), (25.0, 10.0));
}

#[test]
fn a_tables_outer_frame_takes_a_dashed_side() {
    // The map form draws the table's OUTER frame per side through the same
    // emission, so a dashed frame side must become a dashed line there too.
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        style:
          borderWidth: { top: 2 }
          borderStyle: { top: dashed }
        columns:
          - { label: A, data: { key: a } }
"##,
        json!({ "rows": [ { "a": "x" } ] }),
    );
    let lines = line_shapes(&doc.pages[0]);
    let dashed: Vec<_> = lines.iter().filter(|l| l.dash.is_some()).collect();
    assert_eq!(dashed.len(), 1, "the frame's top side carries the pattern");
    assert_eq!(
        dashed[0].dash.map(|d| (d.on, d.off)),
        Some((6.0, 6.0)),
        "three widths on, three off at width 2"
    );
}

#[test]
fn a_per_side_border_refuses_a_radius_and_says_so() {
    let (doc, diags) = run_style("{ borderWidth: { top: 2, left: 2 }, borderRadius: 6 }");
    // Bands only — no rect can carry the corner treatment.
    assert!(rect_shapes(&doc.pages[0])
        .iter()
        .all(|r| r.radius.is_square()));
    let d = diags
        .items
        .iter()
        .find(|d| d.code == "border_radius_ignored")
        .expect("the dropped radius is reported");
    assert!(d.message.contains("per-side"), "{}", d.message);
}

#[test]
fn a_double_border_refuses_a_radius() {
    // `double` needs two lines per side, so it uses the band path too.
    let (_, diags) = run_style("{ borderWidth: 3, borderStyle: double, borderRadius: 6 }");
    assert!(diags
        .items
        .iter()
        .any(|d| d.code == "border_radius_ignored"));
}

#[test]
fn overflow_hidden_clips_to_the_rounded_box() {
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 100, h: 40 }
        style: { borderWidth: 1, borderRadius: 8, overflow: hidden }
        items:
          - { type: text, text: hi }
"##,
        json!({}),
    );
    let clip = crate::clip::only_clip(&doc.pages[0]);
    assert_eq!(
        (clip.radius.rx, clip.radius.ry),
        (8.0, 8.0),
        "the clip must follow the same curve the border drew"
    );
}
