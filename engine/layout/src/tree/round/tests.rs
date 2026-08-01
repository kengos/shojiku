//! Tests for the rounded-rect path builder and the corner clamp.

use super::{rounded_rect_cmds, Corners};
use shojiku_image::PathCmd;

#[test]
fn square_corners_emit_the_plain_rectangle() {
    let cmds = rounded_rect_cmds(10.0, 20.0, 100.0, 50.0, Corners::default());
    assert_eq!(
        cmds,
        vec![
            PathCmd::MoveTo(10.0, 20.0),
            PathCmd::LineTo(110.0, 20.0),
            PathCmd::LineTo(110.0, 70.0),
            PathCmd::LineTo(10.0, 70.0),
            PathCmd::Close,
        ]
    );
}

#[test]
fn a_rounded_rect_has_four_curves_and_four_edges() {
    let cmds = rounded_rect_cmds(0.0, 0.0, 100.0, 60.0, Corners::uniform(10.0));
    let curves = cmds
        .iter()
        .filter(|c| matches!(c, PathCmd::CurveTo(..)))
        .count();
    let lines = cmds
        .iter()
        .filter(|c| matches!(c, PathCmd::LineTo(..)))
        .count();
    assert_eq!((curves, lines), (4, 4));
    assert_eq!(cmds.first(), Some(&PathCmd::MoveTo(10.0, 0.0)));
    assert_eq!(cmds.last(), Some(&PathCmd::Close));
}

#[test]
fn every_point_stays_inside_the_box() {
    // The corner cubics must not bulge past the rectangle they round.
    let cmds = rounded_rect_cmds(5.0, 7.0, 40.0, 30.0, Corners { rx: 12.0, ry: 9.0 });
    let mut pts = Vec::new();
    for cmd in &cmds {
        match *cmd {
            PathCmd::MoveTo(x, y) | PathCmd::LineTo(x, y) => pts.push((x, y)),
            PathCmd::CurveTo(x1, y1, x2, y2, x, y) => {
                pts.extend([(x1, y1), (x2, y2), (x, y)]);
            }
            PathCmd::Close => {}
        }
    }
    for (x, y) in pts {
        assert!((5.0..=45.0).contains(&x), "x {x} escaped the box");
        assert!((7.0..=37.0).contains(&y), "y {y} escaped the box");
    }
}

#[test]
fn an_oversized_radius_scales_both_axes_uniformly_into_a_stadium() {
    // The CSS rule, and the difference a per-axis clamp would get wrong:
    // on an oblong box an absolute over-large radius must come out
    // CIRCULAR at half the SHORT side (a stadium), not rx = w/2, ry = h/2
    // (a full ellipse).
    let c = Corners::uniform(999.0).clamped(40.0, 20.0);
    assert_eq!((c.rx, c.ry), (10.0, 10.0));
    let cmds = rounded_rect_cmds(0.0, 0.0, 40.0, 20.0, Corners::uniform(999.0));
    // The top edge runs from x = 10 to x = 30 — a real straight segment,
    // which is exactly what an ellipse would NOT have.
    assert_eq!(cmds[0], PathCmd::MoveTo(10.0, 0.0));
    assert_eq!(cmds[1], PathCmd::LineTo(30.0, 0.0));
}

#[test]
fn a_fifty_percent_radius_survives_the_clamp_as_an_ellipse() {
    // Half of each side is the largest that still fits, so the scale
    // factor is exactly 1 and the elliptical corners the author asked
    // for are preserved.
    let c = Corners { rx: 65.0, ry: 15.0 }.clamped(130.0, 30.0);
    assert_eq!((c.rx, c.ry), (65.0, 15.0));
}

#[test]
fn one_oversized_axis_scales_the_other_down_with_it() {
    // CSS scales every radius by the same factor, so an over-large
    // vertical radius also pulls the horizontal one in.
    let c = Corners { rx: 8.0, ry: 100.0 }.clamped(96.0, 40.0);
    assert_eq!(c.ry, 20.0);
    assert_eq!(c.rx, 8.0 * (40.0 / 200.0));
}

#[test]
fn a_degenerate_box_falls_back_to_the_rectangle() {
    for (w, h) in [(0.0, 10.0), (10.0, 0.0), (-5.0, 10.0), (f64::NAN, 10.0)] {
        let cmds = rounded_rect_cmds(0.0, 0.0, w, h, Corners::uniform(4.0));
        assert_eq!(cmds.len(), 5, "expected the plain rectangle for {w}×{h}");
    }
}

#[test]
fn clamped_collapses_hostile_values_to_square() {
    let c = Corners {
        rx: f64::NAN,
        ry: f64::INFINITY,
    }
    .clamped(100.0, 50.0);
    assert_eq!((c.rx, c.ry), (0.0, 0.0));
    assert!(c.is_square());
}

#[test]
fn is_square_treats_either_axis_being_zero_as_square() {
    // An ellipse with one zero axis has no visible rounding, and both
    // renderers' fast paths key off this.
    assert!(Corners { rx: 8.0, ry: 0.0 }.is_square());
    assert!(Corners { rx: 0.0, ry: 8.0 }.is_square());
    assert!(!Corners::uniform(1.0).is_square());
}
