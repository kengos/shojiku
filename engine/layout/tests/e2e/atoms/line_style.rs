//! The `line` item's stroke pattern (`style.style`): the dashed cut
//! guide (キリトリ線) and the two-stroke `double` form.

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
