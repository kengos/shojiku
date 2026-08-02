//! Unit tests for the aozora ruby markup parser; the `［＃…］` note
//! grammar, the 大書き span notes, and the placement notes have their own
//! modules.

mod large;
mod note;
mod placement;

use super::*;

fn seg(text: &str, ruby: Option<&str>) -> RubySegment {
    RubySegment {
        text: text.to_string(),
        ruby: ruby.map(str::to_string),
        sheet_break: false,
        scale: None,
        placement: None,
    }
}

/// The same run, preceded by a `［＃改ページ］` sheet break.
fn broken(text: &str, ruby: Option<&str>) -> RubySegment {
    RubySegment {
        sheet_break: true,
        ..seg(text, ruby)
    }
}

#[test]
fn plain_text_is_one_segment() {
    let (segs, warns) = parse_aozora_ruby("名前はまだ無い。");
    assert_eq!(segs, vec![seg("名前はまだ無い。", None)]);
    assert!(warns.is_empty());
}

#[test]
fn empty_input_yields_no_segments() {
    let (segs, warns) = parse_aozora_ruby("");
    assert!(segs.is_empty());
    assert!(warns.is_empty());
}

#[test]
fn reading_binds_to_trailing_kanji_run() {
    let (segs, warns) = parse_aozora_ruby("吾輩《わがはい》は猫である。");
    assert_eq!(
        segs,
        vec![seg("吾輩", Some("わがはい")), seg("は猫である。", None)]
    );
    assert!(warns.is_empty());
}

#[test]
fn kanji_run_stops_at_kana() {
    // Only 輩 belongs to the base run; the kana before it stays plain.
    let (segs, _) = parse_aozora_ruby("わが輩《はい》");
    assert_eq!(segs, vec![seg("わが", None), seg("輩", Some("はい"))]);
}

#[test]
fn iteration_marks_join_the_base_run() {
    let (segs, _) = parse_aozora_ruby("人々《ひとびと》");
    assert_eq!(segs, vec![seg("人々", Some("ひとびと"))]);
    // Every non-range base char joins too (〆 〇 ヶ).
    let (segs, _) = parse_aozora_ruby("〆切《しめきり》");
    assert_eq!(segs[0].text, "〆切");
    let (segs, _) = parse_aozora_ruby("〇《まる》");
    assert_eq!(segs[0].text, "〇");
    let (segs, _) = parse_aozora_ruby("三ヶ日《さんがにち》");
    assert_eq!(segs[0].text, "三ヶ日");
    // Rare-name ranges: CJK compatibility (﨑) and extension A (㐂).
    let (segs, _) = parse_aozora_ruby("\u{FA11}《さき》");
    assert_eq!(segs[0].ruby.as_deref(), Some("さき"));
    let (segs, _) = parse_aozora_ruby("\u{3402}《き》");
    assert_eq!(segs[0].ruby.as_deref(), Some("き"));
}

#[test]
fn every_warning_has_a_static_message() {
    for warning in [
        RubyWarning::Unclosed,
        RubyWarning::EmptyRuby,
        RubyWarning::NoBase,
        RubyWarning::RubyTooLong,
        RubyWarning::DanglingBar,
        RubyWarning::NoteUnclosed,
        RubyWarning::NoteIgnored("ここから2字下げ".into()),
    ] {
        assert!(!warning.message().is_empty(), "{warning:?}");
    }
}

#[test]
fn kana_base_falls_back_to_one_char() {
    let (segs, _) = parse_aozora_ruby("ね《ネ》");
    assert_eq!(segs, vec![seg("ね", Some("ネ"))]);
}

#[test]
fn bar_scopes_the_base_explicitly() {
    let (segs, warns) = parse_aozora_ruby("|昨日《きのう》の朝");
    assert_eq!(segs, vec![seg("昨日", Some("きのう")), seg("の朝", None)]);
    assert!(warns.is_empty());
}

#[test]
fn fullwidth_bar_works_like_ascii() {
    let (segs, _) = parse_aozora_ruby("｜生れた《うまれた》");
    assert_eq!(segs, vec![seg("生れた", Some("うまれた"))]);
}

#[test]
fn multiple_readings_split_correctly() {
    let (segs, warns) = parse_aozora_ruby("船《ふね》と海《うみ》");
    assert_eq!(
        segs,
        vec![
            seg("船", Some("ふね")),
            seg("と", None),
            seg("海", Some("うみ")),
        ]
    );
    assert!(warns.is_empty());
}

#[test]
fn unclosed_reading_is_literal_with_warning() {
    let (segs, warns) = parse_aozora_ruby("船《ふね");
    assert_eq!(segs, vec![seg("船《ふね", None)]);
    assert_eq!(warns, vec![RubyWarning::Unclosed]);
    assert!(!RubyWarning::Unclosed.message().is_empty());
}

#[test]
fn empty_reading_is_literal_with_warning() {
    let (segs, warns) = parse_aozora_ruby("船《》に");
    assert_eq!(segs, vec![seg("船《》に", None)]);
    assert_eq!(warns, vec![RubyWarning::EmptyRuby]);
}

#[test]
fn reading_without_base_is_literal_with_warning() {
    let (segs, warns) = parse_aozora_ruby("《ふね》");
    assert_eq!(segs, vec![seg("《ふね》", None)]);
    assert_eq!(warns, vec![RubyWarning::NoBase]);
}

#[test]
fn explicit_empty_base_warns_no_base() {
    let (_, warns) = parse_aozora_ruby("|《ふね》");
    assert_eq!(warns, vec![RubyWarning::NoBase]);
}

#[test]
fn over_cap_reading_is_literal_with_warning() {
    let reading = "あ".repeat(MAX_RUBY_LEN + 1);
    let (segs, warns) = parse_aozora_ruby(&format!("船《{reading}》"));
    assert_eq!(segs, vec![seg(&format!("船《{reading}》"), None)]);
    assert_eq!(warns, vec![RubyWarning::RubyTooLong]);
}

#[test]
fn reading_at_cap_is_accepted() {
    let reading = "あ".repeat(MAX_RUBY_LEN);
    let (segs, warns) = parse_aozora_ruby(&format!("船《{reading}》"));
    assert_eq!(segs, vec![seg("船", Some(&reading))]);
    assert!(warns.is_empty());
}

#[test]
fn dangling_bar_at_end_is_literal_with_warning() {
    let (segs, warns) = parse_aozora_ruby("船|とめ");
    assert_eq!(segs, vec![seg("船とめ", None)]);
    assert_eq!(warns, vec![RubyWarning::DanglingBar]);
}

#[test]
fn second_bar_flushes_the_first_as_dangling() {
    let (segs, warns) = parse_aozora_ruby("|あ|昨日《きのう》");
    assert_eq!(segs, vec![seg("あ", None), seg("昨日", Some("きのう"))]);
    assert_eq!(warns, vec![RubyWarning::DanglingBar]);
}

#[test]
fn newlines_stay_verbatim_and_split_plain_segments() {
    // The `\n` stays in the text (assignment advances the line on it),
    // but a segment never spans a line boundary — each carries one source
    // line's placement.
    let (segs, _) = parse_aozora_ruby("一行目\n二行目");
    assert_eq!(segs, vec![seg("一行目\n", None), seg("二行目", None)]);
}

#[test]
fn hostile_many_readings_stay_linear_and_bounded() {
    // A params-driven bomb: many tiny readings parse without blowup.
    let input = "船《ふ》".repeat(5_000);
    let (segs, warns) = parse_aozora_ruby(&input);
    assert_eq!(segs.len(), 5_000);
    assert!(warns.is_empty());
}

#[test]
fn every_warning_has_a_nonempty_static_message() {
    // The English fallback each diagnostic consumer sees when it does not
    // translate; the note-echoing variant names its note via a separate
    // arg, so its own message stays generic (never echoes the body).
    let variants = [
        RubyWarning::Unclosed,
        RubyWarning::EmptyRuby,
        RubyWarning::NoBase,
        RubyWarning::RubyTooLong,
        RubyWarning::DanglingBar,
        RubyWarning::NoteUnclosed,
        RubyWarning::NoteIgnored("ZZZ".into()),
        RubyWarning::LargeNoTarget,
        RubyWarning::LargeScaleInvalid,
        RubyWarning::PlacementNotAtLineHead,
        RubyWarning::PlacementDuplicate,
        RubyWarning::PlacementZero,
    ];
    for w in variants {
        assert!(!w.message().is_empty(), "{w:?}");
        assert!(!w.message().contains("ZZZ"), "no note echo in a message");
    }
}
