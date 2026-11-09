//! Unit tests for the viewBox limits and the per-axis coordinate range.

use super::*;

#[test]
fn a_viewbox_at_the_limits_is_accepted() {
    check_viewbox(0.0, 0.0, VIEWBOX_MIN, VIEWBOX_MAX).expect("the smallest and largest sizes");
    check_viewbox(-ORIGIN_MAX, ORIGIN_MAX, 10.0, 10.0).expect("the farthest origin");
}

#[test]
fn a_viewbox_past_a_limit_is_refused_with_the_range_named() {
    for (min_x, min_y, w, h) in [
        (0.0, 0.0, 1e-4, 10.0),
        (0.0, 0.0, 10.0, 1e7),
        (1e10, 0.0, 10.0, 10.0),
        (0.0, -1e10, 10.0, 10.0),
    ] {
        let err = check_viewbox(min_x, min_y, w, h).expect_err("past a limit");
        assert!(
            matches!(&err, ImageError::Svg(m) if m.contains("outside the supported range")),
            "{min_x} {min_y} {w} {h}: {err}"
        );
    }
}

#[test]
fn the_range_is_per_axis_and_keeps_its_edge() {
    // ViewBox 10 x 20: |x| <= 1e4, |y| <= 2e4.
    let bound = Bound::new((10.0, 20.0));
    assert_eq!(bound.check((-1e4, 2e4)), Ok(()));
    assert_eq!(bound.check((10_001.0, 0.0)), Err(Refusal::OutOfRange));
    assert_eq!(bound.check((0.0, 20_001.0)), Err(Refusal::OutOfRange));
}

#[test]
fn a_non_finite_point_is_refused_as_non_finite() {
    let bound = Bound::new((10.0, 10.0));
    assert_eq!(bound.check((f64::NAN, 0.0)), Err(Refusal::NonFinite));
    assert_eq!(bound.check((0.0, f64::INFINITY)), Err(Refusal::NonFinite));
}

#[test]
fn each_refusal_names_its_warning() {
    assert_eq!(Refusal::OutOfRange.warning(), OUT_OF_RANGE);
    assert_eq!(Refusal::NonFinite.warning(), NON_FINITE);
}

#[test]
fn the_stroke_and_gradient_limits_follow_the_viewbox() {
    let bound = Bound::new((10.0, 40.0));
    assert_eq!(bound.stroke_limit(), 1e4);
    assert_eq!(bound.gradient_limit(), 8e4);
}
