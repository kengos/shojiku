//! Unit coverage for 縦中横 combined cells: the segment scanner, the
//! shared-cell glyph layout, the compress-to-fit scale, and the degrade
//! posture. Fixed-pitch `biz-ud-gothic`: full-width = 1em, halfwidth
//! digits exactly 0.5em, so extents are exact.

use super::super::shaped::{segments, SegKind};
use super::super::*;
use super::arrange::ud_chain;
use crate::font::RunOptions;
use shojiku_core::TextOrientation::Mixed;

fn opts(combine: Option<u8>) -> RunOptions {
    let combine = combine.map(shojiku_core::TextCombine::Digits);
    RunOptions {
        letter_spacing: 0.0,
        trim: shojiku_core::TextSpacingTrim::SpaceAll,
        line_start: false,
        combine,
    }
}

#[test]
fn scanner_carves_digit_groups_out_of_orientation_runs() {
    let segs = segments("あ12い", Mixed, Some(shojiku_core::TextCombine::Digits(2)));
    let kinds: Vec<SegKind> = segs.iter().map(|(_, k)| *k).collect();
    assert_eq!(segs.len(), 3);
    assert_eq!(kinds[1], SegKind::Combined);
    assert_eq!(&"あ12い"[segs[1].0.clone()], "12");
}

#[test]
fn scanner_all_takes_the_whole_text_as_one_group() {
    let segs = segments("31日", Mixed, Some(shojiku_core::TextCombine::All));
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].0, 0.."31日".len());
    assert!(matches!(segs[0].1, SegKind::Combined));
}

#[test]
fn scanner_all_over_empty_text_is_segment_free() {
    assert!(segments("", Mixed, Some(shojiku_core::TextCombine::All)).is_empty());
}

#[test]
fn scanner_leaves_over_long_runs_wholly_uncombined() {
    // CSS `digits N`: a run of more than N digits is not combined at
    // all — no suffix re-combines.
    let segs = segments("123", Mixed, Some(shojiku_core::TextCombine::Digits(2)));
    assert!(segs.iter().all(|(_, k)| *k != SegKind::Combined));
}

#[test]
fn scanner_without_the_knob_is_pure_orientation() {
    let segs = segments("あ12い", Mixed, None);
    assert!(segs.iter().all(|(_, k)| matches!(k, SegKind::Orient(_))));
}

#[test]
fn a_digit_pair_shares_one_upright_cell() {
    let chain = ud_chain();
    let glyphs = arrange_vertical(&chain, "12", 10.0, Mixed, opts(Some(2)), 12.0);
    assert_eq!(glyphs.len(), 2);
    // Both glyphs share the cell top; the full 1em advance rides the
    // LAST glyph so extent sums stay exact.
    assert_eq!(glyphs[0].down, 0.0);
    assert_eq!(glyphs[1].down, 0.0);
    assert_eq!(glyphs[0].advance, 0.0);
    assert!((glyphs[1].advance - 10.0).abs() < 1e-9);
    assert!(!glyphs[0].rotated && !glyphs[1].rotated);
    // Two halfwidth digits fill exactly 1em — no compression.
    assert!((glyphs[0].scale - 1.0).abs() < 1e-9);
    // Centered: the pair spans the full column-width midline.
    assert!(glyphs[0].dx < glyphs[1].dx);
    let extent = vertical_extent(&chain, "12", 10.0, Mixed, opts(Some(2)));
    assert!((extent - 10.0).abs() < 1e-9);
}

#[test]
fn an_over_wide_group_compresses_to_the_cell() {
    let chain = ud_chain();
    // Four halfwidth digits = 2em wide → scale 0.5 into the 1em cell.
    let glyphs = arrange_vertical(&chain, "2026", 10.0, Mixed, opts(Some(4)), 12.0);
    assert_eq!(glyphs.len(), 4);
    for g in &glyphs {
        assert!((g.scale - 0.5).abs() < 1e-9, "scale {}", g.scale);
        assert_eq!(g.down, 0.0);
    }
    let extent = vertical_extent(&chain, "2026", 10.0, Mixed, opts(Some(4)));
    assert!((extent - 10.0).abs() < 1e-9, "still one 1em cell");
}

#[test]
fn ordinary_cells_around_a_group_keep_their_advances() {
    let chain = ud_chain();
    let glyphs = arrange_vertical(&chain, "あ12い", 10.0, Mixed, opts(Some(2)), 12.0);
    // あ cell (1em), the combined pair (1em on its last glyph), い cell.
    let extent: f64 = glyphs.iter().map(|g| g.advance).sum();
    assert!((extent - 30.0).abs() < 1e-9, "got {extent}");
    // The pair's cells sit after あ's 1em.
    assert_eq!(glyphs[1].down, 10.0);
    assert_eq!(glyphs[2].down, 10.0);
}

#[test]
fn letter_spacing_widens_the_combined_cell_once() {
    let chain = ud_chain();
    let glyphs = arrange_vertical(
        &chain,
        "12",
        10.0,
        Mixed,
        RunOptions {
            letter_spacing: 2.0,
            trim: shojiku_core::TextSpacingTrim::SpaceAll,
            line_start: false,
            combine: Some(shojiku_core::TextCombine::Digits(2)),
        },
        12.0,
    );
    // One cell → one spacing increment, on the group's advance.
    let extent: f64 = glyphs.iter().map(|g| g.advance).sum();
    assert!((extent - 12.0).abs() < 1e-9, "got {extent}");
}

#[test]
fn a_group_no_single_face_covers_degrades_per_char() {
    // Direct drive: the scanner only emits ASCII digit groups, which
    // every bundled face covers — but hostile input reaching
    // `combined_segment` with uncovered chars must degrade per char
    // (.notdef cells, scale 1), never panic.
    let chain = ud_chain();
    let a = shaped::Arrange {
        chain: &chain,
        size: 10.0,
        orient: Mixed,
        letter_spacing: 0.0,
        trim: shojiku_core::TextSpacingTrim::SpaceAll,
        column_start: false,
        combine: Some(shojiku_core::TextCombine::Digits(2)),
        col_w: 12.0,
    };
    let mut out = Vec::new();
    let mut down = 0.0;
    shaped::combined_segment(&mut out, &mut down, &a, "\u{13000}\u{13001}", 0);
    assert_eq!(out.len(), 2);
    assert!(out.iter().all(|g| (g.scale - 1.0).abs() < 1e-9));
    assert!(down > 0.0, "degrade cells still advance");
}

#[test]
fn a_group_itemizing_across_faces_degrades_per_char() {
    // Two chars with different coverage split into two itemizer
    // sub-runs — no SINGLE face shapes the group, so it degrades.
    let chain = ud_chain();
    let a = shaped::Arrange {
        chain: &chain,
        size: 10.0,
        orient: Mixed,
        letter_spacing: 0.0,
        trim: shojiku_core::TextSpacingTrim::SpaceAll,
        column_start: false,
        combine: Some(shojiku_core::TextCombine::Digits(2)),
        col_w: 12.0,
    };
    let mut out = Vec::new();
    let mut down = 0.0;
    shaped::combined_segment(&mut out, &mut down, &a, "1\u{13000}", 0);
    assert_eq!(out.len(), 2);
    assert!(out.iter().all(|g| (g.scale - 1.0).abs() < 1e-9));
}
