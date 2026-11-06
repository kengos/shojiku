//! The fuzz input shape: settings parse to the engine's admitted ranges or
//! their fallbacks, the body splits into rich spans, and the font chain
//! loads from a `packs/fonts` directory.

use super::*;
use shojiku_core::facts::{FONT_SIZE, LETTER_SPACING};

#[test]
fn the_first_line_holds_the_settings_and_the_rest_is_the_body() {
    let input = Input::parse("w=50 ls=-1.5\nfirst\nsecond");
    assert_eq!(input.body, "first\nsecond");
    assert_eq!(input.number("w", LENGTH), 50.0);
    assert_eq!(input.number("ls", LETTER_SPACING), -1.5);
    // A settings line with no line feed has an empty body.
    assert_eq!(Input::parse("w=1").body, "");
}

#[test]
fn a_missing_unparsable_or_out_of_range_number_takes_the_fallback() {
    let input = Input::parse("size=abc w=-1 h=2000000 ls=NaN\n");
    assert_eq!(input.number("size", FONT_SIZE), FONT_SIZE.fallback);
    assert_eq!(input.number("w", LENGTH), LENGTH.fallback);
    assert_eq!(input.number("h", LENGTH), LENGTH.fallback);
    assert_eq!(input.number("ls", LETTER_SPACING), LETTER_SPACING.fallback);
    assert_eq!(input.number("absent", LENGTH), LENGTH.fallback);
    // A key matches only as a whole name before `=`.
    assert_eq!(Input::parse("ww=5").number("w", LENGTH), LENGTH.fallback);
}

#[test]
fn a_size_list_gives_one_admitted_size_per_entry() {
    let input = Input::parse("size=8,0,12\n");
    assert_eq!(
        input.numbers("size", FONT_SIZE),
        [8.0, FONT_SIZE.fallback, 12.0]
    );
    assert_eq!(
        Input::parse("").numbers("size", FONT_SIZE),
        [FONT_SIZE.fallback]
    );
}

#[test]
fn a_count_above_its_maximum_or_unparsable_takes_the_fallback() {
    let input = Input::parse("lines=3 big=99 bad=x\n");
    assert_eq!(input.count("lines", 10, 2), 3);
    assert_eq!(input.count("big", 10, 2), 2);
    assert_eq!(input.count("bad", 10, 2), 2);
}

#[test]
fn every_enumerated_setting_parses_and_an_unknown_value_takes_the_default() {
    let modes = [
        ("strict", LineBreak::Strict),
        ("loose", LineBreak::Loose),
        ("anywhere", LineBreak::Anywhere),
        ("other", LineBreak::Normal),
    ];
    for (value, mode) in modes {
        assert_eq!(Input::parse(&format!("lb={value}")).line_break(), mode);
    }
    let hangs = [
        ("allow-end", HangingPunctuation::AllowEnd),
        ("force-end", HangingPunctuation::ForceEnd),
        ("other", HangingPunctuation::None),
    ];
    for (value, mode) in hangs {
        assert_eq!(Input::parse(&format!("hang={value}")).hanging(), mode);
    }
    let orients = [
        ("mixed", Some(TextOrientation::Mixed)),
        ("upright", Some(TextOrientation::Upright)),
        ("other", None),
    ];
    for (value, orient) in orients {
        assert_eq!(Input::parse(&format!("orient={value}")).orient(), orient);
    }
    let trims = [
        ("normal", TextSpacingTrim::Normal),
        ("trim-start", TextSpacingTrim::TrimStart),
        ("other", TextSpacingTrim::SpaceAll),
    ];
    for (value, trim) in trims {
        assert_eq!(Input::parse(&format!("trim={value}")).trim(), trim);
    }
    assert!(Input::parse("start=true").flag("start"));
    assert!(!Input::parse("start=yes").flag("start"));
}

#[test]
fn combine_takes_all_or_two_to_four_digits() {
    let cases = [
        ("combine=all", Some(TextCombine::All)),
        ("combine=digits2", Some(TextCombine::Digits(2))),
        ("combine=digits4", Some(TextCombine::Digits(4))),
        ("combine=digits5", None),
        ("combine=digitsx", None),
        ("combine=none", None),
        ("", None),
    ];
    for (settings, combine) in cases {
        assert_eq!(Input::parse(settings).combine(), combine, "{settings}");
    }
}

#[test]
fn the_body_splits_into_at_most_four_spans() {
    let input = Input::parse("\na\u{1e}b\u{1e}c\u{1e}d\u{1e}e");
    assert_eq!(input.spans(), ["a", "b", "c", "d\u{1e}e"]);
    assert_eq!(Input::parse("\n").spans(), [""]);
}

#[test]
fn the_chain_loads_its_four_faces_in_order() {
    let chain = test_chain();
    let ids: Vec<&str> = chain.iter().map(|face| face.id.as_str()).collect();
    assert_eq!(ids, CHAIN_FILES);
}

#[test]
#[should_panic(expected = "a chain face loads")]
fn a_missing_chain_face_panics() {
    text_chain(Path::new("/nonexistent"));
}
