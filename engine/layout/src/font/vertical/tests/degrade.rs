//! Degrade-path tests: the per-char presentation-form arrangement a
//! shaper-less face (or an uncovered run) falls back to — substitution
//! gating, cell nudges, letter spacing, and the empty-input guard.

use super::super::*;
use super::arrange::ud_chain;
use crate::font::test_support::ja_store;
use crate::font::RunOptions;
use shojiku_core::TextOrientation::Mixed;

#[test]
fn degrade_path_substitutes_forms_and_nudges_punctuation() {
    let store = ja_store();
    // A chain whose fallback (ipamj-mincho) maps the presentation-form
    // CHARS the gothic primary lacks — the closed table serves 「 from
    // face index 1, like the pre-shaping arrangement did.
    let primary = store.get("biz-udp-gothic").unwrap();
    let fallback = store.get("ipamj-mincho").unwrap();
    let chain = vec![primary, fallback];
    let a = shaped::Arrange {
        chain: &chain,
        size: 10.0,
        orient: Mixed,
        letter_spacing: 0.0,
        trim: shojiku_core::TextSpacingTrim::SpaceAll,
        column_start: true,
        combine: None,
        col_w: 12.0,
    };
    // Driven directly: the per-char path a shaper-less face falls back to.
    let mut out = Vec::new();
    let mut down = 0.0;
    shaped::degrade_chars(&mut out, &mut down, &a, "「。A", 0);
    // Letter spacing widens every degrade cell too (the shaped-path rule).
    let mut spaced = Vec::new();
    let a_ls = shaped::Arrange {
        letter_spacing: 2.0,
        ..a
    };
    shaped::degrade_chars(&mut spaced, &mut 0.0, &a_ls, "「。A", 0);
    for (b, s) in out.iter().zip(&spaced) {
        assert!((s.advance - (b.advance + 2.0)).abs() < 1e-9);
    }
    // 「 substitutes to its presentation form off the closed table, served
    // by the fallback; its ADVANCE stays the authored char's face (the
    // primary maps 「), so the wrapper's estimate cannot desynchronize.
    assert_eq!(out[0].face_index, 1);
    assert_eq!(out[0].glyph_id, fallback.glyph_id('﹁').unwrap());
    assert!((out[0].advance - primary.vertical_char_advance('「', 10.0)).abs() < 1e-9);
    // 。 keeps its glyph but takes the engine's top-right cell nudge.
    assert_eq!(out[1].glyph_id, primary.glyph_id('。').unwrap());
    let h = primary.advance('。', 10.0);
    let plain_dx = (12.0 - h) / 2.0;
    assert!((out[1].dx - (plain_dx + 0.5 * 10.0)).abs() < 1e-9);
    assert!((out[1].dy - (primary.ascent(10.0) - 0.5 * 10.0)).abs() < 1e-9);
    // Rotated Latin centers about the column axis in the pre-rotation
    // frame.
    assert!(out[2].rotated);
    let ha = primary.advance('A', 10.0);
    assert!((out[2].dx - (6.0 - ha / 2.0)).abs() < 1e-9);
    assert!((down - out.iter().map(|g| g.advance).sum::<f64>()).abs() < 1e-9);
}

#[test]
fn degrade_keeps_original_when_no_face_covers_the_vertical_form() {
    let chain = ud_chain();
    let face = chain[0];
    // Precondition: the gothic face has no cmap entry for the vertical
    // bracket CHAR (its vert coverage is GSUB-only) — so the closed
    // table's substitution degrades to the authored 「, never `.notdef`.
    assert!(face.glyph_id('﹁').is_none(), "fixture face grew ﹁");
    let a = shaped::Arrange {
        chain: &chain,
        size: 10.0,
        orient: Mixed,
        letter_spacing: 0.0,
        trim: shojiku_core::TextSpacingTrim::SpaceAll,
        column_start: true,
        combine: None,
        col_w: 12.0,
    };
    let mut out = Vec::new();
    shaped::degrade_chars(&mut out, &mut 0.0, &a, "「", 0);
    assert_eq!(out[0].glyph_id, face.glyph_id('「').unwrap());
}

#[test]
fn arrange_empty_text_yields_no_glyphs() {
    let chain = ud_chain();
    assert!(
        arrange_vertical(&chain, "", 10.0, Mixed, RunOptions::spacing_only(0.0), 12.0).is_empty()
    );
    assert_eq!(
        vertical_extent(&chain, "", 10.0, Mixed, RunOptions::spacing_only(0.0)),
        0.0
    );
}
