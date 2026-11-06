//! The wrapping harness: inputs that run each checked branch pass its
//! assertions, and each assertion helper panics on lines that break the
//! property it checks.

use super::super::input::test_chain;
use super::*;
use crate::wrap::RichPiece;

fn line(span: usize, text: &str) -> WrappedLine {
    WrappedLine {
        pieces: vec![RichPiece {
            span,
            text: text.to_string(),
        }],
        hung: false,
    }
}

fn span<'a>(faces: &'a [&'a FontFace], text: &'a str) -> RichSpan<'a> {
    RichSpan {
        text,
        faces,
        size: 10.0,
        letter_spacing: 0.0,
        orient: None,
        combine: None,
    }
}

#[test]
fn a_word_wider_than_the_box_overflows_only_in_its_last_unit() {
    let paths = wrap(test_chain(), "w=3 lb=anywhere\nsupercalifragilistic word");
    assert!(paths.width_checked && paths.over_wide, "{paths:?}");
    let paths = wrap(test_chain(), "w=1000 lb=anywhere\nhello world");
    assert!(paths.width_checked && !paths.over_wide, "{paths:?}");
    // A zero-width box puts every unit on its own line.
    let paths = wrap(test_chain(), "w=0 lb=anywhere\nกำลังไปเที่ยว");
    assert!(paths.over_wide, "{paths:?}");
}

#[test]
fn kinsoku_and_hanging_move_a_character_at_some_width() {
    let text = "あいうえおかきくけこ、さしすせそ。たちつてと";
    let moved = |settings: &str| {
        (10..200).any(|w| wrap(test_chain(), &format!("w={w} {settings}\n{text}")).rule_moved)
    };
    assert!(moved("lb=strict"), "kinsoku never moved a character");
    assert!(
        moved("lb=anywhere hang=allow-end"),
        "hanging never moved a character"
    );
}

#[test]
fn a_line_ending_in_a_full_stop_is_hung_under_force_end_without_moving_a_character() {
    let paths = wrap(
        test_chain(),
        "w=60 size=10 lb=anywhere hang=force-end\nあいうえお。かきくけこ",
    );
    assert!(paths.hung && !paths.rule_moved, "{paths:?}");
}

#[test]
fn vertical_text_and_negative_letter_spacing_skip_the_width_rule_but_several_spans_do_not() {
    let paths = wrap(
        test_chain(),
        "w=40 lb=anywhere orient=mixed combine=digits2\n令和12年\n一月",
    );
    assert!(!paths.width_checked);
    let paths = wrap(
        test_chain(),
        "w=40 lb=anywhere size=10,20 ls=-1\nab cd\u{1e}ef gh",
    );
    assert!(!paths.width_checked);
    let paths = wrap(
        test_chain(),
        "w=40 lb=anywhere size=10,20\nab cd\u{1e}ef gh",
    );
    assert!(paths.width_checked);
}

#[test]
fn a_thai_mark_or_the_character_after_a_leading_vowel_starts_no_unit() {
    assert!(unit_starts('a', 'b'));
    assert!(!unit_starts('ก', '\u{0E31}'));
    assert!(!unit_starts('\u{0E40}', 'ก'));
    assert!(unit_starts('\u{0E40}', '\u{0E40}'));
}

#[test]
fn a_space_or_tab_starts_no_unit() {
    assert!(!unit_starts('a', ' '));
    assert!(!unit_starts('a', '\t'));
    assert!(unit_starts(' ', 'a'));
}

#[test]
fn a_thai_mark_after_a_space_passes_the_width_rule() {
    // The wrapper appends the space to the line that ends in ง, and the
    // marks ูุ้ cannot start a line, so the line is `ง ูุ้` and is wider
    // than the zero-width box. The harness allows no unit start before the
    // space or before a mark, so the only unit starts at ง and the check
    // compares an empty prefix with the box.
    let paths = wrap(test_chain(), "w=0 lb=anywhere\nวข้อง ูุ้ว");
    assert!(paths.over_wide && !paths.over_wide_after_prefix);
}

#[test]
fn spaces_and_a_thai_mark_push_a_line_past_the_box_after_a_fitting_prefix() {
    // At 10pt, ก is 6pt wide, a space 2.6pt and ู 0pt: `กก` (12pt) fits the
    // 13pt box and `กก ` (14.6pt) does not. The Thai segmenter finds no
    // break inside `ูกกกกกกกก`, so the word is one token wider than the box,
    // and the wrapper breaks it character by character. The wrapper never
    // breaks before ู, so it appends ู to `กก `, and the line becomes `กก ู`.
    // Its last unit starts at the second ก, and the first ก fits the box.
    let paths = wrap(test_chain(), "w=13 lb=anywhere\nกก ูกกกกกกกก");
    assert!(paths.over_wide_after_prefix);
}

#[test]
#[should_panic(expected = "lost, gained or reordered")]
fn a_dropped_character_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    assert_conserved(&[span(&faces, "abc")], &[line(0, "ab")]);
}

#[test]
#[should_panic(expected = "lower span index")]
fn a_piece_from_an_earlier_span_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    assert_conserved(
        &[span(&faces, "a"), span(&faces, "b")],
        &[line(1, "b"), line(0, "a")],
    );
}

#[test]
#[should_panic(expected = "more lines than characters")]
fn more_lines_than_characters_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    assert_conserved(
        &[span(&faces, "a")],
        &[line(0, "a"), line(0, ""), line(0, "")],
    );
}

#[test]
#[should_panic(expected = "hung with hanging off")]
fn a_hung_line_with_hanging_off_panics() {
    let mut hung = line(0, "あ。");
    hung.hung = true;
    assert_hung(&[hung], HangingPunctuation::None);
}

#[test]
#[should_panic(expected = "does not end in a comma")]
fn a_hung_line_without_its_punctuation_panics() {
    let mut hung = line(0, "あい");
    hung.hung = true;
    assert_hung(&[hung], HangingPunctuation::AllowEnd);
}

#[test]
#[should_panic(expected = "overflows before its last unbreakable unit")]
fn a_line_overflowing_before_its_last_unit_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    assert_width(&[span(&faces, "aaaa")], &[line(0, "aaaa")], 5.0);
}
