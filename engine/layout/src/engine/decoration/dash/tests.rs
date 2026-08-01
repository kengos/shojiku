//! Tests for `dash_pattern` — the keyword→interval table and the floor
//! that keeps a hostile stroke width from exploding the dash walk.

use super::{dash_pattern, DASH_MIN_PT};
use shojiku_core::BorderStyleKind;

#[test]
fn solid_and_double_stroke_without_a_pattern() {
    assert!(dash_pattern(BorderStyleKind::Solid, 1.0).is_none());
    // `double` is two solid lines, emitted by the band path.
    assert!(dash_pattern(BorderStyleKind::Double, 1.0).is_none());
}

#[test]
fn dashed_paints_three_widths_on_and_three_off() {
    let d = dash_pattern(BorderStyleKind::Dashed, 2.0).expect("dashed has a pattern");
    assert_eq!((d.on, d.off), (6.0, 6.0));
}

#[test]
fn dotted_paints_one_width_on_and_one_off() {
    let d = dash_pattern(BorderStyleKind::Dotted, 2.0).expect("dotted has a pattern");
    assert_eq!((d.on, d.off), (2.0, 2.0));
}

#[test]
fn a_near_zero_width_floors_both_intervals() {
    // The hostile case: without the floor a full-page dotted border at
    // this width would be ~10^11 dash segments for the rasterizer to walk.
    let d = dash_pattern(BorderStyleKind::Dotted, 1e-9).expect("dotted has a pattern");
    assert_eq!((d.on, d.off), (DASH_MIN_PT, DASH_MIN_PT));
}

#[test]
fn non_finite_and_negative_widths_degrade_to_the_floor() {
    for width in [f64::NAN, f64::INFINITY, -5.0, 0.0] {
        let d = dash_pattern(BorderStyleKind::Dashed, width)
            .expect("a dashed style always yields a pattern");
        assert_eq!(
            (d.on, d.off),
            (DASH_MIN_PT, DASH_MIN_PT),
            "width {width} must not produce a degenerate interval"
        );
        // Both renderers reject a non-positive interval by dropping the
        // whole stroke, so the emitted value must stay strictly positive.
        assert!(d.on > 0.0 && d.on.is_finite());
    }
}

#[test]
fn a_wide_border_scales_the_interval_past_the_floor() {
    let d = dash_pattern(BorderStyleKind::Dashed, 1000.0).expect("dashed has a pattern");
    assert_eq!((d.on, d.off), (3000.0, 3000.0));
}
