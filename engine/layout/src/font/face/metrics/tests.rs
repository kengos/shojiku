//! Unit tests for vertical band metrics (cap height, descent).

use super::{cap_or_fallback, descent_or_fallback, vadvance_or_fallback, vmtx_or_none};

#[test]
fn vmtx_scales_a_sane_advance() {
    // 2048 units at upem 2048 × 10pt = one em.
    assert_eq!(vmtx_or_none(2048.0, 2048.0, 10.0), Some(10.0));
}

#[test]
fn vmtx_rejects_hostile_values() {
    // Zero, over-2em, and a degenerate upem (division by zero → inf)
    // all fall back to the ascent−descent estimate path.
    assert_eq!(vmtx_or_none(0.0, 1000.0, 10.0), None);
    assert_eq!(vmtx_or_none(2100.0, 1000.0, 10.0), None);
    assert_eq!(vmtx_or_none(1000.0, 0.0, 10.0), None);
    // At the admitted maximum (2em) the value passes.
    assert_eq!(vmtx_or_none(2000.0, 1000.0, 10.0), Some(20.0));
}

#[test]
fn vadvance_spans_ascent_to_descender() {
    // (800 − −200) / 1000 upem * 10pt = 10pt (one em).
    assert!((vadvance_or_fallback(800.0, -200.0, 1000.0, 10.0) - 10.0).abs() < 1e-9);
    // A 1.2em-tall face reports 1.2em down-advance.
    assert!((vadvance_or_fallback(900.0, -300.0, 1000.0, 10.0) - 12.0).abs() < 1e-9);
}

#[test]
fn vadvance_falls_back_on_hostile_values() {
    // Non-finite upem, zero span, negative span, and an over-2em span
    // all degrade to 1em (size).
    assert!((vadvance_or_fallback(800.0, -200.0, 0.0, 10.0) - 10.0).abs() < 1e-9);
    assert!((vadvance_or_fallback(0.0, 0.0, 1000.0, 10.0) - 10.0).abs() < 1e-9);
    assert!((vadvance_or_fallback(-200.0, 800.0, 1000.0, 10.0) - 10.0).abs() < 1e-9);
    assert!((vadvance_or_fallback(30000.0, -200.0, 1000.0, 10.0) - 10.0).abs() < 1e-9);
}

#[test]
fn vadvance_handles_hostile_extreme_units() {
    // f64::MAX ascent → non-finite scaled span → fallback, no panic.
    assert!((vadvance_or_fallback(f64::MAX, f64::MIN, 1.0, 10.0) - 10.0).abs() < 1e-9);
}

#[test]
fn cap_scales_a_present_value() {
    // 700 units / 1000 upem * 10pt = 7pt.
    assert!((cap_or_fallback(Some(700.0), 1000.0, 10.0) - 7.0).abs() < 1e-9);
}

#[test]
fn cap_falls_back_when_absent() {
    assert!((cap_or_fallback(None, 1000.0, 10.0) - 7.2).abs() < 1e-9);
}

#[test]
fn cap_falls_back_on_hostile_values() {
    // Zero, negative, over-1.2em, and non-finite all degrade.
    assert!((cap_or_fallback(Some(0.0), 1000.0, 10.0) - 7.2).abs() < 1e-9);
    assert!((cap_or_fallback(Some(-500.0), 1000.0, 10.0) - 7.2).abs() < 1e-9);
    assert!((cap_or_fallback(Some(13000.0), 1000.0, 10.0) - 7.2).abs() < 1e-9);
    assert!((cap_or_fallback(Some(700.0), 0.0, 10.0) - 7.2).abs() < 1e-9);
}

#[test]
fn descent_takes_magnitude_of_a_signed_value() {
    // -200 units / 1000 upem * 10pt → 2pt downward.
    assert!((descent_or_fallback(-200.0, 1000.0, 10.0) - 2.0).abs() < 1e-9);
}

#[test]
fn descent_falls_back_on_hostile_values() {
    // Deeper than 1em, and a non-finite upem, both degrade to 0.22em.
    assert!((descent_or_fallback(-13000.0, 1000.0, 10.0) - 2.2).abs() < 1e-9);
    assert!((descent_or_fallback(-200.0, 0.0, 10.0) - 2.2).abs() < 1e-9);
}
