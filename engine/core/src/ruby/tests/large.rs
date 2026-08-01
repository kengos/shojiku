//! Unit tests for the `［＃「…」は大書き］` span notes: target binding,
//! the multiplier grammar, and every malformed form degrading to literal
//! text plus a warning.

use super::seg;
use crate::ruby::*;

/// A large segment: `text` drawn across `scale × scale` cells each.
fn large(text: &str, scale: usize) -> RubySegment {
    RubySegment {
        scale: Some(scale),
        ..seg(text, None)
    }
}

#[test]
fn bare_note_scales_the_preceding_text_by_two() {
    let (segs, warns) = parse_aozora_ruby("会話［＃「会話」は大書き］");
    assert_eq!(segs, vec![large("会話", 2)]);
    assert!(warns.is_empty());
}

#[test]
fn a_multiplier_note_uses_that_scale() {
    let (segs, warns) = parse_aozora_ruby("題［＃「題」は３倍の大書き］");
    assert_eq!(segs, vec![large("題", 3)]);
    assert!(warns.is_empty());
}

#[test]
fn an_ascii_multiplier_is_accepted() {
    let (segs, _) = parse_aozora_ruby("題［＃「題」は3倍の大書き］");
    assert_eq!(segs, vec![large("題", 3)]);
}

#[test]
fn a_two_digit_multiplier_is_accepted() {
    let (segs, _) = parse_aozora_ruby("字［＃「字」は12倍の大書き］");
    assert_eq!(segs, vec![large("字", 12)]);
}

#[test]
fn text_before_the_span_stays_its_own_segment() {
    let (segs, _) = parse_aozora_ruby("前ふり会話［＃「会話」は大書き］");
    assert_eq!(segs, vec![seg("前ふり", None), large("会話", 2)]);
}

#[test]
fn a_scale_below_two_renders_literally_and_warns() {
    let (segs, warns) = parse_aozora_ruby("題［＃「題」は1倍の大書き］");
    assert_eq!(segs, vec![seg("題［＃「題」は1倍の大書き］", None)]);
    assert_eq!(warns, vec![RubyWarning::LargeScaleInvalid]);
}

#[test]
fn a_zero_scale_renders_literally_and_warns() {
    let (_, warns) = parse_aozora_ruby("題［＃「題」は0倍の大書き］");
    assert_eq!(warns, vec![RubyWarning::LargeScaleInvalid]);
}

#[test]
fn three_digits_is_not_a_multiplier_and_the_note_is_ignored() {
    // The digit run is capped at two, so a longer run is not a number;
    // the body then matches no grammar and renders literally, naming
    // itself like any unsupported note.
    let (segs, warns) = parse_aozora_ruby("題［＃「題」は100倍の大書き］");
    assert_eq!(segs, vec![seg("題［＃「題」は100倍の大書き］", None)]);
    assert_eq!(
        warns,
        vec![RubyWarning::NoteIgnored("「題」は100倍の大書き".into())]
    );
}

#[test]
fn an_unmatched_target_renders_literally_and_warns() {
    // The `「…」` text is not the text just before the note.
    let (segs, warns) = parse_aozora_ruby("会話あ［＃「会話」は大書き］");
    assert_eq!(segs, vec![seg("会話あ［＃「会話」は大書き］", None)]);
    assert_eq!(warns, vec![RubyWarning::LargeNoTarget]);
}

#[test]
fn an_empty_target_renders_literally_and_warns() {
    let (_, warns) = parse_aozora_ruby("あ［＃「」は大書き］");
    assert_eq!(warns, vec![RubyWarning::LargeNoTarget]);
}

#[test]
fn a_note_with_no_preceding_text_renders_literally_and_warns() {
    let (segs, warns) = parse_aozora_ruby("［＃「題」は大書き］");
    assert_eq!(segs, vec![seg("［＃「題」は大書き］", None)]);
    assert_eq!(warns, vec![RubyWarning::LargeNoTarget]);
}

#[test]
fn a_note_after_ruby_with_a_wrong_target_renders_literally() {
    // The last segment exists but its text is not the target, so the
    // note does not bind and falls through to the literal path.
    let (segs, warns) = parse_aozora_ruby("会話《かいわ》［＃「不一致」は大書き］");
    assert_eq!(segs[0].scale, None);
    assert_eq!(warns, vec![RubyWarning::LargeNoTarget]);
}

#[test]
fn digits_not_followed_by_the_multiplier_word_are_not_a_span() {
    // `3の大書き` parses digits but the tail is not `倍の`, so the body
    // matches no grammar and renders literally.
    let (_, warns) = parse_aozora_ruby("題［＃「題」は3の大書き］");
    assert_eq!(
        warns,
        vec![RubyWarning::NoteIgnored("「題」は3の大書き".into())]
    );
}

#[test]
fn a_note_after_ruby_scales_that_reading_segment() {
    // 会話《かいわ》 then a note targeting 会話: the note attaches to the
    // just-emitted ruby segment rather than needing plain text before it.
    let (segs, warns) = parse_aozora_ruby("会話《かいわ》［＃「会話」は大書き］");
    assert_eq!(
        segs,
        vec![RubySegment {
            scale: Some(2),
            ..seg("会話", Some("かいわ"))
        }]
    );
    assert!(warns.is_empty());
}

#[test]
fn a_span_carries_a_pending_sheet_break() {
    let (segs, _) = parse_aozora_ruby("表紙［＃改ページ］題［＃「題」は大書き］");
    assert_eq!(
        segs,
        vec![
            seg("表紙", None),
            RubySegment {
                sheet_break: true,
                ..large("題", 2)
            },
        ]
    );
}

#[test]
fn a_note_inside_a_pending_bar_stays_literal() {
    // A `|`-scoped base is still open: `［＃` is not a note opener there
    // (the author is spelling base text), so the whole thing is literal
    // and the unclosed bar is the only warning.
    let (segs, warns) = parse_aozora_ruby("あ|後［＃「後」は大書き］");
    assert_eq!(segs, vec![seg("あ後［＃「後」は大書き］", None)]);
    assert_eq!(warns, vec![RubyWarning::DanglingBar]);
}

#[test]
fn a_target_containing_a_close_bracket_does_not_parse() {
    // The target is taken up to the first `」`, so `「あ」」` yields target
    // `あ` and leftover `」は大書き` fails the tail — literal, ignored.
    let (_, warns) = parse_aozora_ruby("あ［＃「あ」」は大書き］");
    assert_eq!(
        warns,
        vec![RubyWarning::NoteIgnored("「あ」」は大書き".into())]
    );
}
