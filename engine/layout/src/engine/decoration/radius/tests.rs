//! Tests for `resolve_corners` — the per-axis `%` rule and the hostile
//! value rejections. The `Ctx` wrapper's warning path is covered by the
//! layout e2e suite.

use super::resolve_corners;
use shojiku_core::{FontRel, Length, PhysicalUnit};
use shojiku_layout_box::Basis;

fn basis() -> Basis {
    Basis {
        x: 0.0,
        w: 200.0,
        h: Some(100.0),
        font: FontRel {
            em: 10.0,
            rem: 10.0,
        },
    }
}

#[test]
fn an_absolute_length_gives_equal_radii() {
    let c = resolve_corners(&Length::Pt(6.0), 200.0, 100.0, &basis()).expect("resolves");
    assert_eq!((c.rx, c.ry), (6.0, 6.0));
}

#[test]
fn a_physical_length_converts_to_points_on_both_axes() {
    let c = resolve_corners(
        &Length::Physical(1.0, PhysicalUnit::In),
        200.0,
        100.0,
        &basis(),
    )
    .expect("resolves");
    assert_eq!((c.rx, c.ry), (72.0, 72.0));
}

#[test]
fn em_and_rem_resolve_against_the_font_bases() {
    let em = resolve_corners(&Length::Em(2.0), 200.0, 100.0, &basis()).expect("resolves");
    assert_eq!((em.rx, em.ry), (20.0, 20.0));
    let rem = resolve_corners(&Length::Rem(0.5), 200.0, 100.0, &basis()).expect("resolves");
    assert_eq!((rem.rx, rem.ry), (5.0, 5.0));
}

#[test]
fn a_percent_resolves_each_axis_against_its_own_side() {
    // The CSS rule that makes `50%` a pill on an oblong box: the two
    // radii differ, so this is the case a single-value design would lose.
    let c = resolve_corners(&Length::Percent(50.0), 200.0, 100.0, &basis()).expect("resolves");
    assert_eq!((c.rx, c.ry), (100.0, 50.0));
}

#[test]
fn fifty_percent_of_a_square_is_a_circle() {
    let c = resolve_corners(&Length::Percent(50.0), 80.0, 80.0, &basis()).expect("resolves");
    assert_eq!((c.rx, c.ry), (40.0, 40.0));
}

#[test]
fn a_negative_radius_is_rejected() {
    assert!(resolve_corners(&Length::Pt(-5.0), 200.0, 100.0, &basis()).is_none());
    assert!(resolve_corners(&Length::Percent(-10.0), 200.0, 100.0, &basis()).is_none());
}

#[test]
fn a_non_finite_radius_is_rejected() {
    // `1e300` × a percentage basis overflows to infinity — "the input was
    // finite" does not make the arithmetic finite.
    assert!(resolve_corners(&Length::Pt(f64::INFINITY), 200.0, 100.0, &basis()).is_none());
    assert!(resolve_corners(&Length::Em(f64::NAN), 200.0, 100.0, &basis()).is_none());
    assert!(resolve_corners(&Length::Percent(1e300), 1e300, 1e300, &basis()).is_none());
}

#[test]
fn an_enormous_finite_radius_resolves_then_clamps_to_the_box() {
    // Resolution keeps it (it is finite); the clamp is what bounds it.
    let c = resolve_corners(&Length::Pt(1e300), 200.0, 100.0, &basis()).expect("resolves");
    assert_eq!((c.rx, c.ry), (1e300, 1e300));
    // The CSS uniform scale factor brings both axes to half the SHORT
    // side — a stadium, not the ellipse a per-axis clamp would give.
    let clamped = c.clamped(200.0, 100.0);
    assert_eq!((clamped.rx, clamped.ry), (50.0, 50.0));
}
