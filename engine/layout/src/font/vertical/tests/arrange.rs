//! Unit coverage for the vertical ARRANGEMENT: shaped upright cells
//! (GSUB `vert`, vmtx advances, vertical-origin offsets incl. the
//! synthesized fallback), rotated runs (horizontal-shaper parity,
//! ligatures/kerning), the per-char degrade path, letter spacing, and
//! the extent invariants. The fixed-pitch `biz-ud-gothic` face makes
//! every full-width advance exactly 1em.

use super::super::*;
use crate::font::test_support::ja_store;
use crate::font::RunOptions;
use shojiku_core::TextOrientation::{Mixed, Upright};

pub(super) fn ud_chain() -> Vec<&'static crate::font::FontFace> {
    vec![ja_store().get("biz-ud-gothic").unwrap()]
}

#[test]
fn shaped_upright_substitutes_gsub_vert_forms() {
    let chain = ud_chain();
    let face = chain[0];
    // The long vowel mark ー is UAX#50 Tr: upright cell, glyph rotated by
    // the font's `vert` substitution — the closed table could never do
    // this. The bracket 「 likewise swaps to its vertical glyph via GSUB
    // on the PRIMARY face (no fallback needed).
    for c in ['ー', '「', '、'] {
        let text = c.to_string();
        let glyphs = arrange_vertical(
            &chain,
            &text,
            10.0,
            Mixed,
            RunOptions::spacing_only(0.0),
            12.0,
        );
        assert_eq!(glyphs.len(), 1, "{c}");
        let g = &glyphs[0];
        assert!(!g.rotated, "{c} stays an upright cell");
        assert_eq!(g.face_index, 0);
        assert_ne!(
            g.glyph_id,
            face.glyph_id(c).unwrap(),
            "{c} must draw its vert alternate, not the horizontal glyph"
        );
        // The vertical origin puts the baseline inside the cell.
        assert!(g.dy > 0.0 && g.dy <= 20.0, "{c} dy {}", g.dy);
    }
}

#[test]
fn shaped_upright_advances_stack_one_em_cells() {
    let chain = ud_chain();
    let glyphs = arrange_vertical(
        &chain,
        "吾輩は",
        10.0,
        Mixed,
        RunOptions::spacing_only(0.0),
        12.0,
    );
    assert_eq!(glyphs.len(), 3);
    for (i, g) in glyphs.iter().enumerate() {
        assert!((g.advance - 10.0).abs() < 1e-6, "cell {i}: {}", g.advance);
        assert!((g.down - 10.0 * i as f64).abs() < 1e-6, "top {i}");
        assert_eq!(g.source, i * 3..(i + 1) * 3, "source {i}");
    }
}

#[test]
fn rotated_runs_shape_with_horizontal_parity() {
    let chain = ud_chain();
    // A rotated Latin run reproduces the horizontal shaper exactly —
    // kerning and ligatures included: its extent is the horizontal
    // run_width, glyph for glyph.
    let text = "Wave2026";
    let horizontal = crate::font::run_width(
        &chain,
        text,
        10.0,
        crate::font::RunOptions::spacing_only(0.0),
    );
    let extent = vertical_extent(&chain, text, 10.0, Mixed, RunOptions::spacing_only(0.0));
    assert!(
        (extent - horizontal).abs() < 1e-6,
        "{extent} vs {horizontal}"
    );
    let glyphs = arrange_vertical(
        &chain,
        text,
        10.0,
        Mixed,
        RunOptions::spacing_only(0.0),
        12.0,
    );
    assert!(glyphs.iter().all(|g| g.rotated));
}

/// Loaded from the pack directly: the ja store has no Latin face with
/// ligatures/kerning, and the rotated path must prove it shapes (not
/// per-char-advances) with a font that discriminates.
fn noto_face() -> crate::font::FontFace {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packs/fonts/noto-sans/NotoSans-Regular.ttf");
    crate::font::FontFace::load("noto-sans", &path).expect("load noto-sans")
}

#[test]
fn rotated_runs_ligate_and_kern_like_horizontal_text() {
    let f = noto_face();
    let chain = vec![&f];
    // fi collapses to ONE rotated glyph whose cluster spans both chars
    // (ToUnicode) — impossible on a per-char path.
    let tight = arrange_vertical(
        &chain,
        "fi",
        100.0,
        Mixed,
        RunOptions::spacing_only(0.0),
        120.0,
    );
    assert_eq!(tight.len(), 1);
    assert!(tight[0].rotated);
    assert_eq!(tight[0].source, 0..2);
    // Non-zero letter spacing suppresses the ligature, the horizontal rule.
    let spaced = arrange_vertical(
        &chain,
        "fi",
        100.0,
        Mixed,
        RunOptions::spacing_only(5.0),
        120.0,
    );
    assert_eq!(spaced.len(), 2);
    // Kerning pulls AV's down-extent under the per-char estimate sum.
    let est: f64 = "AV"
        .chars()
        .map(|c| down_advance_over(&chain, c, 100.0, Mixed))
        .sum();
    let shaped = vertical_extent(&chain, "AV", 100.0, Mixed, RunOptions::spacing_only(0.0));
    assert!(shaped < est - 1.0, "kerned {shaped} !< estimate {est}");
}

#[test]
fn upright_latin_on_a_vmtx_less_face_keeps_the_baseline_in_the_cell() {
    // noto-sans has no vmtx/vhea/VORG: `textOrientation: upright` shapes
    // it top-to-bottom through the shaper's SYNTHESIZED vertical origin —
    // the baseline must land inside the cell (dy > 0, roughly the
    // ascent), and cells must still advance, or upright Latin would draw
    // stacked into its neighbour's cell.
    let f = noto_face();
    let chain = vec![&f];
    let glyphs = arrange_vertical(
        &chain,
        "AB",
        100.0,
        Upright,
        RunOptions::spacing_only(0.0),
        120.0,
    );
    assert_eq!(glyphs.len(), 2);
    for g in &glyphs {
        assert!(!g.rotated);
        assert!(g.advance > 50.0, "cell must advance, got {}", g.advance);
        assert!(
            g.dy > 50.0 && g.dy <= 200.0,
            "baseline must sit inside the cell, dy {}",
            g.dy
        );
    }
}

#[test]
fn mixed_text_segments_keep_monotone_cells() {
    let chain = ud_chain();
    let glyphs = arrange_vertical(
        &chain,
        "平26年",
        10.0,
        Mixed,
        RunOptions::spacing_only(0.0),
        12.0,
    );
    assert_eq!(glyphs.len(), 4);
    assert!(!glyphs[0].rotated && glyphs[1].rotated);
    assert!(glyphs[2].rotated && !glyphs[3].rotated);
    // Cells stack strictly down across segment boundaries.
    for w in glyphs.windows(2) {
        assert!((w[1].down - (w[0].down + w[0].advance)).abs() < 1e-6);
    }
}

#[test]
fn extent_is_the_sum_of_arranged_advances_and_ignores_column_width() {
    let chain = ud_chain();
    let text = "吾輩はWaveだ。";
    let extent = vertical_extent(&chain, text, 10.0, Mixed, RunOptions::spacing_only(0.0));
    let sum: f64 = arrange_vertical(
        &chain,
        text,
        10.0,
        Mixed,
        RunOptions::spacing_only(0.0),
        99.0,
    )
    .iter()
    .map(|g| g.advance)
    .sum();
    assert!((extent - sum).abs() < 1e-9);
}

#[test]
fn letter_spacing_widens_every_cell_on_the_shaped_path() {
    let chain = ud_chain();
    let bare = arrange_vertical(
        &chain,
        "A漢",
        10.0,
        Mixed,
        RunOptions::spacing_only(0.0),
        12.0,
    );
    let spaced = arrange_vertical(
        &chain,
        "A漢",
        10.0,
        Mixed,
        RunOptions::spacing_only(2.0),
        12.0,
    );
    assert_eq!(bare.len(), spaced.len());
    for (b, s) in bare.iter().zip(&spaced) {
        assert!((s.advance - (b.advance + 2.0)).abs() < 1e-6);
    }
}

#[test]
fn uncovered_chars_degrade_per_char_without_panicking() {
    let chain = ud_chain();
    // No ja face maps Bopomofo ㆠ (upright) or New Tai Lue ᦀ (rotated):
    // the segment routes through the degrade path — `.notdef`, the 1em
    // upright fallback advance, finite positions.
    let glyphs = arrange_vertical(
        &chain,
        "ㆠᦀ",
        10.0,
        Mixed,
        RunOptions::spacing_only(0.0),
        12.0,
    );
    assert_eq!(glyphs.len(), 2);
    assert_eq!(glyphs[0].glyph_id, 0);
    assert!(!glyphs[0].rotated && glyphs[1].rotated);
    for g in &glyphs {
        assert!(g.advance.is_finite() && g.dx.is_finite() && g.dy.is_finite());
    }
}
