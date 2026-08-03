//! The `line` item's stroke pattern (`style.style`): the dashed cut
//! guide (キリトリ線) and the two-stroke `double` form — plus the sanity
//! bound on `style.width`, which reaches the renderers' stroke math
//! directly and so shares `borderWidth`'s 0..=1000pt cap.

use crate::common::*;

fn run_line(style: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r##"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: line
        from: {{ x: 0, y: 50 }}
        to: {{ x: 200, y: 50 }}
        style: {style}
"##
        ),
        json!({}),
    )
}

#[test]
fn a_line_strokes_solid_by_default() {
    let (doc, _) = run_line("{ width: 1 }");
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 1);
    assert!(lines[0].dash.is_none());
}

#[test]
fn a_dashed_line_carries_the_pattern() {
    // The キリトリ線 case: one item, one keyword.
    let (doc, _) = run_line("{ width: 0.8, style: dashed }");
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 1);
    let dash = lines[0].dash.expect("dashed carries a pattern");
    assert!((dash.on - 2.4).abs() < 1e-9, "on = {}", dash.on);
    assert!((dash.off - 2.4).abs() < 1e-9, "off = {}", dash.off);
}

#[test]
fn a_dotted_line_uses_one_width_per_interval() {
    let (doc, _) = run_line("{ width: 2, style: dotted }");
    let dash = line_shapes(&doc.pages[0])[0]
        .dash
        .expect("dotted carries a pattern");
    assert_eq!((dash.on, dash.off), (2.0, 2.0));
}

#[test]
fn a_double_line_becomes_two_thin_strokes_either_side() {
    let (doc, _) = run_line("{ width: 3, style: double }");
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 2, "double draws a pair");
    // Each a third of the authored width, offset a third either side of
    // the authored y along the line's normal.
    for l in &lines {
        assert_eq!(l.width, 1.0);
        assert!(l.dash.is_none(), "double is two SOLID strokes");
        assert_eq!((l.x1, l.x2), (0.0, 200.0));
    }
    let mut ys: Vec<f64> = lines.iter().map(|l| l.y1).collect();
    ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
    assert_eq!(ys, vec![49.0, 51.0]);
}

#[test]
fn a_double_diagonal_offsets_along_the_normal_not_an_axis() {
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: line
        from: { x: 0, y: 0 }
        to: { x: 30, y: 40 }
        style: { width: 3, style: double }
"##,
        json!({}),
    );
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 2);
    // Unit normal of (30,40)/50 is (-0.8, 0.6); scaled by width/3 = 1.
    let mut starts: Vec<(f64, f64)> = lines.iter().map(|l| (l.x1, l.y1)).collect();
    starts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    assert_eq!(starts, vec![(-0.8, 0.6), (0.8, -0.6)]);
}

#[test]
fn a_zero_length_double_line_stays_a_single_stroke() {
    // No direction means no normal to offset along; degrading to one
    // stroke beats emitting NaN coordinates.
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: line
        from: { x: 10, y: 10 }
        to: { x: 10, y: 10 }
        style: { width: 3, style: double }
"##,
        json!({}),
    );
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 1);
    assert!(lines[0].x1.is_finite() && lines[0].y1.is_finite());
}

/// Pinned copy of the engine's stroke-width cap, asserted as behavior.
const MAX_STROKE_WIDTH_PT: f64 = 1_000.0;

#[test]
fn a_stroke_width_past_the_cap_falls_back_to_the_wire_default() {
    let (doc, diags) = run_line("{ width: 1e300 }");
    assert!(
        diags.iter().any(|d| d.code == "invalid_line_width"),
        "{diags:?}"
    );
    // Degrades to 1pt, not to 0: a line that strokes nothing is an item
    // that draws nothing (unlike `borderWidth`, whose 0 IS "no border").
    assert_eq!(line_shapes(&doc.pages[0])[0].width, 1.0);
}

#[test]
fn the_largest_admitted_stroke_width_passes_clean() {
    let (doc, diags) = run_line("{ width: 1000 }");
    assert!(
        !diags.iter().any(|d| d.code == "invalid_line_width"),
        "{diags:?}"
    );
    assert_eq!(line_shapes(&doc.pages[0])[0].width, MAX_STROKE_WIDTH_PT);
}

#[test]
fn a_negative_stroke_width_falls_back_with_a_diagnostic() {
    // Unlike `borderWidth`, a negative `line` width parses fine — the
    // guard is the only thing standing between it and the stroke math.
    let (doc, diags) = run_line("{ width: -1 }");
    assert!(
        diags.iter().any(|d| d.code == "invalid_line_width"),
        "{diags:?}"
    );
    assert_eq!(line_shapes(&doc.pages[0])[0].width, 1.0);
}

#[test]
fn a_zero_stroke_width_stays_legal_and_undiagnosed() {
    let (doc, diags) = run_line("{ width: 0 }");
    assert!(
        !diags.iter().any(|d| d.code == "invalid_line_width"),
        "{diags:?}"
    );
    assert_eq!(line_shapes(&doc.pages[0])[0].width, 0.0);
}

#[test]
fn a_dash_pattern_derives_from_the_clamped_width() {
    // The guard runs before `dash_pattern`, so the interval is three
    // times the FALLBACK width, not three times 1e300.
    let (doc, _) = run_line("{ width: 1e300, style: dashed }");
    let dash = line_shapes(&doc.pages[0])[0]
        .dash
        .expect("dashed carries a pattern");
    assert_eq!((dash.on, dash.off), (3.0, 3.0));
}

#[test]
fn the_double_split_derives_from_the_clamped_width() {
    let (doc, _) = run_line("{ width: 1e300, style: double }");
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!(lines.len(), 2, "double still draws a pair");
    for l in &lines {
        assert!((l.width - 1.0 / 3.0).abs() < 1e-9, "width {}", l.width);
    }
}

#[test]
fn an_unknown_line_style_keyword_is_a_parse_error() {
    let err = shojiku_core::parse_template(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: line
        from: { x: 0, y: 0 }
        to: { x: 10, y: 0 }
        style: { width: 1, style: zigzag }
"##,
    )
    .expect_err("an unknown keyword must not be silently defaulted");
    let message = format!("{err}");
    assert!(message.contains("zigzag"), "{message}");
}
