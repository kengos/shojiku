//! The overflow harness: inputs that run each policy pass every
//! assertion, and the clamped-line assertion panics on a line that breaks
//! the property it checks.

use super::super::input::test_chain;
use super::*;

fn fit<'a>(faces: &'a [&'a FontFace], width: f64) -> Fit<'a> {
    Fit {
        faces,
        width,
        size: 10.0,
        letter_spacing: 0.0,
        line_break: LineBreak::Normal,
    }
}

#[test]
fn text_that_fits_is_neither_shrunk_nor_clamped() {
    let paths = overflow(test_chain(), "w=500 h=500 size=10\nhi");
    assert_eq!(paths, OverflowPaths::default());
    // An authored size under the floor that fits is kept as authored.
    let paths = overflow(test_chain(), "w=500 h=500 size=2\nhi");
    assert_eq!(paths, OverflowPaths::default());
}

#[test]
fn overflowing_text_is_shrunk_and_clamped() {
    let body = "abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz";
    let paths = overflow(test_chain(), &format!("w=60 h=12 size=20 lines=1\n{body}"));
    assert!(
        paths.shrunk_above_floor && paths.clamped_nonempty && paths.single_clamped,
        "{paths:?}"
    );
    // A box too short even at the floor keeps the floor.
    let paths = overflow(test_chain(), &format!("w=10 h=1 lines=3 lb=strict\n{body}"));
    assert!(
        paths.shrunk_to_floor && !paths.shrunk_above_floor,
        "{paths:?}"
    );
}

#[test]
fn a_zero_line_clamp_removes_nothing_and_a_zero_width_box_keeps_an_empty_prefix() {
    let paths = overflow(test_chain(), "w=60 lines=0\nabcdefghijklmnopqrstuvwxyz");
    assert!(!paths.clamped, "{paths:?}");
    let paths = overflow(test_chain(), "w=0 lines=1\nabc");
    assert!(paths.clamped && !paths.clamped_nonempty, "{paths:?}");
}

#[test]
fn the_body_is_cut_to_its_character_cap() {
    let body = "a".repeat(MAX_BODY_CHARS + 10);
    let input = format!("w=50\n{body}");
    assert_eq!(
        capped_body(&Input::parse(&input)).chars().count(),
        MAX_BODY_CHARS
    );
    assert_eq!(capped_body(&Input::parse("\nabc")), "abc");
}

#[test]
#[should_panic(expected = "not a prefix of the original")]
fn a_clamped_line_that_is_not_a_prefix_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    fit(&faces, 100.0).assert_clamped_line("xyz…", "abc");
}

#[test]
#[should_panic(expected = "may not end a line")]
fn a_clamped_line_ending_in_an_opening_bracket_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    fit(&faces, 100.0).assert_clamped_line("あ「…", "あ「い");
}

#[test]
#[should_panic(expected = "wider than the box")]
fn a_clamped_line_wider_than_the_box_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    fit(&faces, 1.0).assert_clamped_line("abc…", "abcd");
}

#[test]
#[should_panic(expected = "ends in an ellipsis")]
fn a_clamped_line_without_its_ellipsis_panics() {
    let faces: Vec<&FontFace> = test_chain().iter().collect();
    fit(&faces, 100.0).assert_clamped_line("abc", "abcd");
}
