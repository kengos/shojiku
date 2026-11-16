//! Unit tests for the clamp-unit split of a vertical column's text under
//! tate-chu-yoko (縦中横): which byte ranges the ellipsis clamp keeps or
//! drops as one unit.

use super::trim_units;
use shojiku_core::TextCombine;

#[test]
fn without_combining_every_char_is_its_own_unit() {
    assert_eq!(
        trim_units("あ1い", None),
        vec![(0..3, false), (3..4, false), (4..7, false)]
    );
}

#[test]
fn combine_all_makes_the_whole_text_one_unit() {
    assert_eq!(
        trim_units("12あ", Some(TextCombine::All)),
        vec![(0..5, true)]
    );
}

#[test]
fn combine_all_over_an_empty_text_has_no_unit() {
    assert_eq!(trim_units("", Some(TextCombine::All)), vec![]);
}

#[test]
fn a_digit_run_within_the_limit_is_one_unit() {
    assert_eq!(
        trim_units("あ12い", Some(TextCombine::Digits(2))),
        vec![(0..3, false), (3..5, true), (5..8, false)]
    );
}

#[test]
fn a_digit_run_longer_than_the_limit_stays_per_char() {
    // Three digits under `digits 2` are not combined, matching the
    // arrangement the renderers draw.
    assert_eq!(
        trim_units("あ123", Some(TextCombine::Digits(2))),
        vec![(0..3, false), (3..4, false), (4..5, false), (5..6, false)]
    );
}

#[test]
fn a_single_digit_stays_per_char() {
    assert_eq!(
        trim_units("a1b", Some(TextCombine::Digits(2))),
        vec![(0..1, false), (1..2, false), (2..3, false)]
    );
}
