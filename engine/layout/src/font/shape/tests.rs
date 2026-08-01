//! Unit tests for fallback-aware shaping (F3). Uses the bundled ja pack:
//! `biz-udp-gothic` (the default) lacks the CJK Ext-B surname kanji `𠮷`
//! (U+20BB7, as in 𠮷野家) that `ipamj-mincho` has, giving a real
//! primary/fallback coverage gap.

use super::*;
use crate::font::test_support::ja_store;

#[test]
fn single_face_chain_matches_the_single_face_helpers() {
    let store = ja_store();
    let f = store.face(None);
    let glyphs = shape_run(&[f], "Aあ", 10.0, RunOptions::spacing_only(0.0));
    assert_eq!(glyphs.len(), 2);
    assert!(glyphs.iter().all(|g| g.face_index == 0));
    // The chain width equals the single-face width (one home).
    assert!(
        (run_width(&[f], "Aあ", 10.0, RunOptions::spacing_only(0.0))
            - f.text_width("Aあ", 10.0, 0.0))
        .abs()
            < 1e-9
    );
}

#[test]
fn a_char_the_primary_lacks_falls_back_to_the_next_face() {
    let store = ja_store();
    let primary = store.get("biz-udp-gothic").unwrap();
    let fallback = store.get("ipamj-mincho").unwrap();
    // Sanity: the coverage gap the test depends on.
    assert!(primary.glyph_id('𠮷').is_none());
    assert!(fallback.glyph_id('𠮷').is_some());
    let chain = [primary, fallback];
    // "a𠮷": 'a' from the primary (index 0), '𠮷' from the fallback (1).
    let glyphs = shape_run(&chain, "a𠮷", 10.0, RunOptions::spacing_only(0.0));
    assert_eq!(glyphs[0].face_index, 0);
    assert_eq!(glyphs[1].face_index, 1);
    // The fallback glyph is the real one, not `.notdef` (0).
    assert_eq!(glyphs[1].glyph_id, fallback.glyph_id('𠮷').unwrap());
    // `𠮷`'s advance comes from the fallback face; the width reflects it.
    let w = run_width(&chain, "a𠮷", 10.0, RunOptions::spacing_only(0.0));
    let expect = primary.advance('a', 10.0) + fallback.advance('𠮷', 10.0);
    assert!((w - expect).abs() < 1e-9);
}

#[test]
fn all_missing_only_when_no_chain_face_covers_the_char() {
    let store = ja_store();
    let chain = [
        store.get("biz-udp-gothic").unwrap(),
        store.get("ipamj-mincho").unwrap(),
    ];
    // Covered by the fallback → not missing.
    assert!(!all_missing(&chain, '𠮷'));
    // Covered by the primary → not missing.
    assert!(!all_missing(&chain, 'あ'));
    // In no bundled face → missing (drives the `missing_glyph` warning).
    assert!(all_missing(&chain, '\u{10FFFF}'));
    // With no fallback, the primary alone decides.
    assert!(all_missing(&[store.get("biz-udp-gothic").unwrap()], '𠮷'));
}

/// Loads Noto Sans (a Latin face with kern pairs and standard ligatures)
/// straight from the pack for the shaping assertions below — the ja default
/// `biz-udp-gothic` is proportional but exercises neither.
fn noto() -> crate::font::FontFace {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packs/fonts/noto-sans/NotoSans-Regular.ttf");
    crate::font::FontFace::load("noto-sans", &path).expect("load noto-sans")
}

#[test]
fn kerning_pulls_a_latin_pair_closer_than_the_sum_of_advances() {
    let f = noto();
    let chain = [&f];
    // Kerning rides advances, so AV is still two glyphs, just narrower than
    // the unkerned per-char sum.
    assert_eq!(
        shape_run(&chain, "AV", 100.0, RunOptions::spacing_only(0.0)).len(),
        2
    );
    let shaped = run_width(&chain, "AV", 100.0, RunOptions::spacing_only(0.0));
    let per_char = f.advance('A', 100.0) + f.advance('V', 100.0);
    assert!(
        shaped < per_char - 1.0,
        "shaped {shaped} !< per_char {per_char}"
    );
}

#[test]
fn a_standard_ligature_becomes_one_glyph_spanning_its_source_cluster() {
    let f = noto();
    let glyphs = shape_run(&[&f], "fi", 100.0, RunOptions::spacing_only(0.0));
    assert_eq!(glyphs.len(), 1);
    // The single ligature glyph maps back to both source chars (ToUnicode).
    assert_eq!(glyphs[0].source, 0..2);
    // The `ffi` three-char ligature likewise spans its whole cluster.
    let ffi = shape_run(&[&f], "office", 100.0, RunOptions::spacing_only(0.0));
    assert!(ffi.iter().any(|g| g.source == (1..4)));
}

#[test]
fn letter_spacing_suppresses_optional_ligatures_and_widens_each_advance() {
    let f = noto();
    let chain = [&f];
    // Non-zero letter-spacing turns the fi ligature back into two glyphs...
    assert_eq!(
        shape_run(&chain, "fi", 100.0, RunOptions::spacing_only(5.0)).len(),
        2
    );
    // ...and adds the extra advance once per glyph (2 glyphs x 5pt).
    let tight = run_width(&chain, "fi", 100.0, RunOptions::spacing_only(0.0));
    assert!(
        (run_width(&chain, "fi", 100.0, RunOptions::spacing_only(5.0)) - (tight + 10.0)).abs()
            < 1e-6
    );
}

#[test]
fn run_width_is_exactly_the_sum_of_shaped_advances() {
    let f = noto();
    let chain = [&f];
    let text = "Office AV fi";
    let sum: f64 = shape_run(&chain, text, 40.0, RunOptions::spacing_only(0.5))
        .iter()
        .map(|g| g.advance)
        .sum();
    assert!((run_width(&chain, text, 40.0, RunOptions::spacing_only(0.5)) - sum).abs() < 1e-9);
}

#[test]
fn char_width_estimates_per_char_including_the_missing_glyph_fallback() {
    let store = ja_store();
    let f = store.face(None);
    let chain = [f];
    // A covered char measures to its real advance.
    assert!((char_width(&chain, 'A', 10.0, 0.0) - f.advance('A', 10.0)).abs() < 1e-9);
    // A char no face maps degrades to the 0.6em missing-glyph width.
    let missing = '\u{10FFFF}';
    assert!(f.glyph_id(missing).is_none());
    assert!((char_width(&chain, missing, 10.0, 0.0) - 10.0 * 0.6).abs() < 1e-9);
}

#[test]
fn a_char_no_chain_face_maps_keeps_the_missing_glyph_advance_and_notdef() {
    let store = ja_store();
    let chain = [store.get("biz-udp-gothic").unwrap()];
    let missing = '\u{10FFFF}'.to_string();
    let glyphs = shape_run(&chain, &missing, 10.0, RunOptions::spacing_only(0.0));
    assert_eq!(glyphs.len(), 1);
    assert_eq!(glyphs[0].glyph_id, 0); // .notdef
    assert!((glyphs[0].advance - 10.0 * 0.6).abs() < 1e-9);
}

/// Pins the layout-side sign convention for GPOS positioning: y-down, so
/// a mark raised above the baseline has a NEGATIVE `y_offset`. The PDF
/// backend flips this to krilla's up-positive convention at its boundary
/// (`render-pdf` has the mirror test); the PNG backend adds it as-is.
#[test]
fn stacked_marks_rise_with_negative_y_offset_in_the_y_down_convention() {
    let f = noto();
    // x + two combining acutes: mark-to-mark GPOS lifts the second acute
    // above the first — a real upward y offset with the bundled face.
    let glyphs = shape_run(
        &[&f],
        "x\u{0301}\u{0301}",
        100.0,
        RunOptions::spacing_only(0.0),
    );
    assert_eq!(glyphs.len(), 3);
    let top = &glyphs[2];
    assert!(top.y_offset < -10.0, "raised mark, got {}", top.y_offset);
    // The marks are zero-advance and share the base's whole cluster range.
    assert_eq!(top.advance, 0.0);
    assert_eq!(top.source, 0..5);
}

#[test]
fn shaping_is_deterministic_across_calls() {
    let store = ja_store();
    let primary = store.get("biz-udp-gothic").unwrap();
    let fallback = store.get("ipamj-mincho").unwrap();
    let chain = [primary, fallback];
    // Mixed segments: Latin + CJK + a fallback-served char + a missing one.
    let text = "Va あ𠮷\u{10FFFF}";
    assert_eq!(
        shape_run(&chain, text, 12.0, RunOptions::spacing_only(0.3)),
        shape_run(&chain, text, 12.0, RunOptions::spacing_only(0.3))
    );
}

#[test]
fn cluster_ends_resolves_boundaries_in_one_pass() {
    // Distinct clusters end where the next begins; the last at seg_len.
    assert_eq!(cluster_ends(&[0, 1, 4], 7), vec![1, 4, 7]);
    // A ligature/mark run (equal clusters) shares the next boundary.
    assert_eq!(cluster_ends(&[0, 0, 3], 5), vec![3, 3, 5]);
    // Single glyph and empty input.
    assert_eq!(cluster_ends(&[2], 4), vec![4]);
    assert_eq!(cluster_ends(&[], 0), Vec::<usize>::new());
}

#[test]
fn down_pt_flips_hostile_extremes_without_overflow() {
    use super::harf::down_pt;
    // Negate-in-widened-type: i32::MIN would overflow if negated as i32.
    let scale = 12.0 / 1000.0;
    assert!((down_pt(i32::MIN, scale) - ((i32::MAX as i64 + 1) as f64) * scale).abs() < 1e-6);
    assert!(down_pt(i32::MAX, scale) < 0.0);
    // A typical vertical advance (negative, going down) comes out positive.
    assert!((down_pt(-1000, scale) - 12.0).abs() < 1e-9);
}

#[test]
fn cluster_ends_clamps_hostile_cluster_values() {
    // Out-of-range and non-monotone clusters must still yield ranges the
    // renderers can consume: every end is bounded by seg_len (the
    // consumer's `end.max(cluster)` then keeps ranges non-inverted).
    assert_eq!(cluster_ends(&[9, 2], 4), vec![4, 4]);
    assert_eq!(cluster_ends(&[5, 0, 7], 3), vec![3, 3, 3]);
}
