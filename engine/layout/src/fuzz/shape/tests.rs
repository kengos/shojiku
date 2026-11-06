//! The shaping harness: inputs that run each shaping branch pass every
//! assertion, and each assertion helper panics on glyphs that break the
//! property it checks.

use super::super::input::test_chain;
use super::*;

fn glyph(source: std::ops::Range<usize>, x: f64, advance: f64) -> PositionedGlyph {
    PositionedGlyph {
        glyph_id: 1,
        x,
        advance,
        x_offset: 0.0,
        y_offset: 0.0,
        source,
        face_index: 0,
    }
}

#[test]
fn covered_and_unmapped_characters_run_their_branches() {
    let paths = shape(test_chain(), "size=12\noffice क्षि ภาษา");
    assert!(paths.shaped && !paths.missing, "{paths:?}");
    let paths = shape(test_chain(), "ls=2\na\u{10FFFD}b");
    assert!(paths.shaped && paths.missing, "{paths:?}");
    assert_eq!(shape(test_chain(), ""), ShapePaths::default());
}

#[test]
fn trimming_narrows_adjacent_fullwidth_punctuation() {
    let paths = shape(test_chain(), "trim=normal size=10\nあ」「い");
    assert!(paths.trimmed, "{paths:?}");
    let paths = shape(test_chain(), "trim=trim-start start=true\n「あ」");
    assert!(paths.trimmed, "{paths:?}");
}

#[test]
#[should_panic(expected = "splits a character")]
fn a_source_range_inside_a_character_panics() {
    assert_sources("あ", &[glyph(0..1, 0.0, 1.0)]);
}

#[test]
#[should_panic(expected = "in no glyph's source range")]
fn an_uncovered_character_panics() {
    assert_sources("abc", &[glyph(0..1, 0.0, 1.0), glyph(2..3, 1.0, 1.0)]);
}

#[test]
#[should_panic(expected = "the text's tail")]
fn an_uncovered_tail_panics() {
    assert_sources("ab", &[glyph(0..1, 0.0, 1.0)]);
}

#[test]
#[should_panic(expected = "ends past the text")]
fn a_source_range_past_the_text_panics() {
    assert_sources("a", &[glyph(0..2, 0.0, 1.0)]);
}

#[test]
#[should_panic(expected = "is inverted")]
fn an_inverted_source_range_panics() {
    #[allow(clippy::reversed_empty_ranges)] // the hostile range under test
    let inverted = 1..0;
    assert_sources("a", &[glyph(inverted, 0.0, 1.0)]);
}

#[test]
#[should_panic(expected = "not the sum of the advances")]
fn a_pen_position_off_the_running_sum_panics() {
    assert_pen(&[glyph(0..1, 0.0, 1.0), glyph(1..2, 2.0, 1.0)]);
}

#[test]
#[should_panic(expected = "not finite")]
fn a_non_finite_advance_panics() {
    assert_pen(&[glyph(0..1, 0.0, f64::NAN)]);
}

#[test]
#[should_panic(expected = "past its face's glyph count")]
fn a_glyph_id_past_the_face_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    let mut g = glyph(0..1, 0.0, 1.0);
    g.glyph_id = u32::MAX;
    assert_glyph_ids(&faces, &[g]);
}

#[test]
#[should_panic(expected = "trimming widened a glyph")]
fn a_widened_glyph_panics() {
    assert_trim_narrows(&[glyph(0..1, 0.0, 2.0)], &[glyph(0..1, 0.0, 1.0)]);
}

#[test]
#[should_panic(expected = "trimming replaced a glyph")]
fn a_replaced_glyph_panics() {
    let mut other = glyph(0..1, 0.0, 1.0);
    other.glyph_id = 2;
    assert_trim_narrows(&[other], &[glyph(0..1, 0.0, 1.0)]);
}
