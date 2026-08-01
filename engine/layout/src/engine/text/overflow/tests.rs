//! Unit tests for the overflow policy helpers: shrink bisection bounds
//! and the ellipsis clamp's measurement/kinsoku behavior.

use super::*;
use crate::font::test_support::ja_store;
use crate::wrap::wrap_text;

#[test]
fn fit_font_size_returns_base_when_it_already_fits() {
    let store = ja_store();
    let face = store.face(None);
    // One short line in a tall box: no shrink needed.
    let size = fit_font_size(
        &[face],
        "aaa",
        10.0,
        1.0,
        200.0,
        100.0,
        LineBreak::Normal,
        0.0,
    );
    assert_eq!(size, 10.0);
}

#[test]
fn fit_font_size_shrinks_until_the_wrapped_text_fits() {
    let store = ja_store();
    let face = store.face(None);
    // CJK chars have a uniform ~1em advance: at 10pt each char is ~10pt
    // wide, so 8 chars in a 40pt-wide box need 2+ lines; the box height
    // (12pt) fits exactly one 1.0-line-height line at ≤ 6pt... the exact
    // target does not matter — the contract is: result < base, result ≥
    // floor, and the wrapped text at the result actually fits.
    let content = "ああああああああ";
    let size = fit_font_size(
        &[face],
        content,
        10.0,
        1.0,
        40.0,
        12.0,
        LineBreak::Normal,
        0.0,
    );
    assert!(size < 10.0, "must shrink, got {size}");
    assert!(size >= MIN_SHRINK_FONT_PT);
    let lines = wrap_text(face, content, size, 40.0, LineBreak::Normal, 0.0);
    assert!(lines.len() as f64 * size * 1.0 <= 12.0 + 0.01);
}

#[test]
fn fit_font_size_stops_at_the_floor_when_nothing_fits() {
    let store = ja_store();
    let face = store.face(None);
    // A box too small for even one 4pt line: the floor comes back and the
    // caller's overflow warning handles the rest.
    let size = fit_font_size(
        &[face],
        "ああああああああああ",
        10.0,
        1.0,
        10.0,
        1.0,
        LineBreak::Normal,
        0.0,
    );
    assert_eq!(size, MIN_SHRINK_FONT_PT);
}

#[test]
fn clamp_keeps_fitting_lines_and_appends_ellipsis() {
    let store = ja_store();
    let face = store.face(None);
    let lines = vec!["ああああ".to_string(), "いいいい".to_string()];
    // Wide box: the kept line fits with the ellipsis untrimmed.
    let clamped = clamp_with_ellipsis(&[face], lines, 10.0, 0.0, 200.0, 1);
    assert_eq!(clamped, vec!["ああああ…".to_string()]);
}

#[test]
fn clamp_trims_the_last_line_until_the_ellipsis_fits() {
    let store = ja_store();
    let face = store.face(None);
    let em = face.text_width("あ", 10.0, 0.0);
    let lines = vec!["ああああ".to_string()];
    // Room for ~3em + the ellipsis: one あ must be trimmed.
    let clamped = clamp_with_ellipsis(&[face], lines, 10.0, 0.0, em * 3.6, 1);
    assert_eq!(clamped, vec!["ああ…".to_string()]);
    let w = face.text_width(&clamped[0], 10.0, 0.0);
    assert!(w <= em * 3.6 + 0.01, "clamped line must fit: {w}");
}

#[test]
fn clamp_strips_line_end_prohibited_chars_before_the_ellipsis() {
    let store = ja_store();
    let face = store.face(None);
    // Trimming lands on an opening bracket: it must go too (never `「…`).
    let lines = vec!["ああ「かかか".to_string()];
    let em = face.text_width("あ", 10.0, 0.0);
    let clamped = clamp_with_ellipsis(&[face], lines, 10.0, 0.0, em * 4.2, 1);
    assert_eq!(clamped, vec!["ああ…".to_string()]);
}

#[test]
fn clamp_degrades_to_a_bare_ellipsis_when_nothing_fits() {
    let store = ja_store();
    let face = store.face(None);
    // Content box narrower than the ellipsis itself: the line empties and
    // the bare ellipsis is kept (text is clamped, never silently lost
    // wider than the box by more than the ellipsis glyph).
    let clamped = clamp_with_ellipsis(&[face], vec!["ああ".to_string()], 10.0, 0.0, 0.5, 1);
    assert_eq!(clamped, vec!["…".to_string()]);
}

#[test]
fn clamp_to_zero_lines_drops_everything() {
    let store = ja_store();
    let face = store.face(None);
    let clamped = clamp_with_ellipsis(&[face], vec!["あ".to_string()], 10.0, 0.0, 100.0, 0);
    assert!(clamped.is_empty());
}
