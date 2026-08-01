//! Unit tests for the `［＃…］` 注記 grammar: the acted-on 改ページ
//! sheet break, and every other note degrading to literal text.

use super::{broken, seg};
use crate::ruby::*;

#[test]
fn sheet_break_flags_the_following_run() {
    let (segs, warns) = parse_aozora_ruby("表紙［＃改ページ］本文");
    assert_eq!(segs, vec![seg("表紙", None), broken("本文", None)]);
    assert!(warns.is_empty());
}

#[test]
fn sheet_break_flags_a_following_ruby_run() {
    // The break lands on whichever segment comes first after it — here
    // the annotated base, since no plain text separates them.
    let (segs, _) = parse_aozora_ruby("表紙［＃改ページ］吾輩《わがはい》は");
    assert_eq!(
        segs,
        vec![
            seg("表紙", None),
            broken("吾輩", Some("わがはい")),
            seg("は", None),
        ]
    );
}

#[test]
fn leading_and_consecutive_breaks_collapse_into_one_flag() {
    let (segs, warns) = parse_aozora_ruby("［＃改ページ］［＃改ページ］本文");
    assert_eq!(segs, vec![broken("本文", None)]);
    assert!(warns.is_empty());
}

#[test]
fn trailing_break_is_dropped() {
    // Nothing follows it, so it would add no sheet.
    let (segs, _) = parse_aozora_ruby("本文［＃改ページ］");
    assert_eq!(segs, vec![seg("本文", None)]);
}

#[test]
fn unsupported_note_is_literal_and_names_itself() {
    let (segs, warns) = parse_aozora_ruby("あ［＃ここから2字下げ］い");
    assert_eq!(segs, vec![seg("あ［＃ここから2字下げ］い", None)]);
    assert_eq!(
        warns,
        vec![RubyWarning::NoteIgnored("ここから2字下げ".into())]
    );
}

#[test]
fn unclosed_note_is_literal_with_warning() {
    let (segs, warns) = parse_aozora_ruby("あ［＃改ページ");
    assert_eq!(segs, vec![seg("あ［＃改ページ", None)]);
    assert_eq!(warns, vec![RubyWarning::NoteUnclosed]);
}

#[test]
fn note_over_the_cap_never_closes() {
    // The scan stops at the cap, so the note (and the `］` past it) stay
    // literal instead of feeding an unbounded body into a diagnostic.
    let body = "あ".repeat(MAX_NOTE_LEN + 1);
    let (segs, warns) = parse_aozora_ruby(&format!("［＃{body}］"));
    assert_eq!(warns, vec![RubyWarning::NoteUnclosed]);
    assert_eq!(segs[0].text.chars().count(), 2 + MAX_NOTE_LEN + 2);
}

#[test]
fn note_at_the_cap_is_accepted() {
    let body = "あ".repeat(MAX_NOTE_LEN);
    let (_, warns) = parse_aozora_ruby(&format!("［＃{body}］"));
    assert_eq!(warns, vec![RubyWarning::NoteIgnored(body)]);
}

#[test]
fn halfwidth_bracket_is_not_a_note() {
    // Aozora notes are fullwidth; `[#...]` is ordinary text (citations
    // and code would otherwise be eaten).
    let (segs, warns) = parse_aozora_ruby("[#改ページ]本文");
    assert_eq!(segs, vec![seg("[#改ページ]本文", None)]);
    assert!(warns.is_empty());
}

#[test]
fn fullwidth_bracket_without_hash_stays_literal() {
    let (segs, warns) = parse_aozora_ruby("［注］本文");
    assert_eq!(segs, vec![seg("［注］本文", None)]);
    assert!(warns.is_empty());
}

#[test]
fn note_inside_a_reading_stays_literal() {
    let (segs, warns) = parse_aozora_ruby("船《ふ［＃改ページ］ね》");
    assert_eq!(segs, vec![seg("船", Some("ふ［＃改ページ］ね"))]);
    assert!(warns.is_empty());
}

#[test]
fn note_inside_an_explicit_base_stays_literal() {
    // A `|` scopes a reading's base; a note there is base text.
    let (segs, warns) = parse_aozora_ruby("|昨［＃改ページ］日《きのう》");
    assert_eq!(segs, vec![seg("昨［＃改ページ］日", Some("きのう"))]);
    assert!(warns.is_empty());
}
