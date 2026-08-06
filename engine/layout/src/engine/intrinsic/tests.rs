//! Unit tests for the intrinsic-width guards. The per-kind measurements
//! themselves are exercised end-to-end (they need a font store and a
//! resolved cascade); what lives here is the pure clamp every arm funnels
//! through, whose hostile branches no ordinary template reaches.

use super::clamp_measured;
use shojiku_layout_box::MAX_RESOLVED_PT;

#[test]
fn clamp_measured_passes_an_ordinary_width_through() {
    assert_eq!(clamp_measured(120.5), 120.5);
    assert_eq!(clamp_measured(0.0), 0.0);
}

#[test]
fn clamp_measured_bounds_a_width_past_the_resolve_cap() {
    // Max-content is the one measurement with no container to bound it:
    // a params-driven string shapes in full, so the cap is what keeps a
    // hostile value out of the track arithmetic.
    assert_eq!(clamp_measured(MAX_RESOLVED_PT * 10.0), MAX_RESOLVED_PT);
    assert_eq!(clamp_measured(1e308), MAX_RESOLVED_PT);
}

#[test]
fn clamp_measured_collapses_a_non_finite_width_to_zero() {
    // Degrading to 0 rather than propagating: an `inf` basis would poison
    // every sum it takes part in, and `NaN` would defeat the comparisons
    // the row planner makes against it.
    assert_eq!(clamp_measured(f64::INFINITY), 0.0);
    assert_eq!(clamp_measured(f64::NEG_INFINITY), 0.0);
    assert_eq!(clamp_measured(f64::NAN), 0.0);
}

#[test]
fn clamp_measured_floors_a_negative_width_at_zero() {
    assert_eq!(clamp_measured(-1.0), 0.0);
}
