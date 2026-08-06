//! Unit tests for the decoration metrics: real font tables, fallback
//! behavior, and the hostile-value clamps.

use super::face::decoration::scaled_or_fallback;
use super::test_support::ja_store;

#[test]
fn bundled_face_supplies_real_decoration_metrics() {
    let store = ja_store();
    let face = store.face(None);
    let size = 20.0;
    let (u_off, u_th) = face.underline_metrics(size);
    // BIZ UD's post table: underline sits below the baseline (y-up
    // negative), with a sane thickness.
    assert!(
        u_off < 0.0,
        "underline offset {u_off} should be below baseline"
    );
    assert!(u_th > 0.0 && u_th <= 0.5 * size, "thickness {u_th}");
    let (s_off, s_th) = face.strikeout_metrics(size);
    // OS/2 strikeout sits above the baseline.
    assert!(
        s_off > 0.0,
        "strikeout offset {s_off} should be above baseline"
    );
    assert!(s_th > 0.0 && s_th <= 0.5 * size, "thickness {s_th}");
    // Metrics scale linearly with the font size.
    let (u_off_2x, _) = face.underline_metrics(size * 2.0);
    assert!((u_off_2x - u_off * 2.0).abs() < 1e-9);
}

#[test]
fn missing_tables_fall_back_to_conventional_lines() {
    let (off, th) = scaled_or_fallback(None, 1000.0, -0.1, 10.0);
    assert!((off - -1.0).abs() < 1e-9);
    assert!((th - 0.5).abs() < 1e-9);
}

#[test]
fn hostile_table_values_fall_back() {
    // Offset beyond ±1em (would draw the line far outside the text) and
    // degenerate/absurd thicknesses all take the fallback.
    for units in [
        Some((-5000.0, 50.0)), // offset -5em
        Some((-100.0, 0.0)),   // zero thickness
        Some((-100.0, -20.0)), // negative thickness
        Some((-100.0, 900.0)), // thickness close to the em size
    ] {
        let (off, th) = scaled_or_fallback(units, 1000.0, -0.1, 10.0);
        assert!(
            (off - -1.0).abs() < 1e-9,
            "units {units:?} should fall back"
        );
        assert!((th - 0.5).abs() < 1e-9);
    }
    // Sane values pass through scaled.
    let (off, th) = scaled_or_fallback(Some((-100.0, 50.0)), 1000.0, -0.1, 10.0);
    assert!((off - -1.0).abs() < 1e-9);
    assert!((th - 0.5).abs() < 1e-9);
    let (off2, _) = scaled_or_fallback(Some((-200.0, 50.0)), 1000.0, -0.1, 10.0);
    assert!((off2 - -2.0).abs() < 1e-9);
}
