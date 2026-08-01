//! Unit tests for wrapping, break opportunities, and kinsoku.

use super::*;
use crate::font::test_support::ja_store;

#[test]
fn short_text_is_single_line() {
    let store = ja_store();
    let lines = wrap_text(
        store.face(None),
        "hello",
        10.0,
        200.0,
        LineBreak::Normal,
        0.0,
    );
    assert_eq!(lines, vec!["hello"]);
}

#[test]
fn latin_wraps_at_word_boundaries() {
    let store = ja_store();
    let face = store.face(None);
    // Same letter throughout: every word has an identical width, so
    // the wrap point is exactly one word per line.
    let text = "aaa aaa aaa aaa";
    let word_width = face.text_width("aaa", 10.0, 0.0);
    let lines = wrap_text(face, text, 10.0, word_width + 1.0, LineBreak::Normal, 0.0);
    assert_eq!(lines, vec!["aaa", "aaa", "aaa", "aaa"]);
}

#[test]
fn cjk_breaks_anywhere() {
    let store = ja_store();
    // Fixed-pitch face: every full-width glyph is exactly 1em, so the
    // geometry is predictable (the default biz-udp kana are proportional).
    let face = store.get("biz-ud-gothic").unwrap();
    // 6 full-width chars at size 10 => 60pt total; 25pt fits 2 per line.
    // None are kinsoku chars, so Normal and Anywhere agree here.
    let lines = wrap_text(face, "あいうえおか", 10.0, 25.0, LineBreak::Anywhere, 0.0);
    assert_eq!(lines, vec!["あい", "うえ", "おか"]);
}

#[test]
fn newlines_split_paragraphs() {
    let store = ja_store();
    let lines = wrap_text(
        store.face(None),
        "a\nb\n\nc",
        10.0,
        100.0,
        LineBreak::Normal,
        0.0,
    );
    assert_eq!(lines, vec!["a", "b", "", "c"]);
}

#[test]
fn oversized_word_is_hard_broken() {
    let store = ja_store();
    let face = store.face(None);
    let char_width = face.text_width("a", 10.0, 0.0);
    let lines = wrap_text(
        face,
        "aaaaaaaaaa",
        10.0,
        char_width * 3.5,
        LineBreak::Normal,
        0.0,
    );
    assert!(lines.len() >= 3, "expected hard break, got {lines:?}");
    assert!(lines.iter().all(|l| l.chars().count() <= 3));
}

#[test]
fn empty_text_is_one_empty_line() {
    let store = ja_store();
    let lines = wrap_text(store.face(None), "", 10.0, 100.0, LineBreak::Normal, 0.0);
    assert_eq!(lines, vec![""]);
}

// The kinsoku fixtures below use the fixed-pitch `biz-ud-gothic` face,
// where every full-width glyph (kana, brackets, 。) advances exactly 1em,
// so at size 10 a 25pt line fits two per row and a 35pt line fits three.
// (The default `biz-udp-gothic` has proportional kana — unpredictable
// column counts.)

#[test]
fn kinsoku_pulls_prohibited_line_start_down() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // Greedy wrap alone puts `。` at the head of line 2.
    let anywhere = wrap_text(face, "ああ。あ", 10.0, 25.0, LineBreak::Anywhere, 0.0);
    assert_eq!(anywhere, vec!["ああ", "。あ"]);
    // Normal pushes the preceding char down so `。` is no longer a
    // line head.
    let normal = wrap_text(face, "ああ。あ", 10.0, 25.0, LineBreak::Normal, 0.0);
    assert_eq!(normal, vec!["あ", "あ。あ"]);
}

#[test]
fn kinsoku_pushes_prohibited_line_end_down() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // Greedy wrap alone leaves an opening bracket `「` at a line end.
    let anywhere = wrap_text(face, "あ「ああ", 10.0, 25.0, LineBreak::Anywhere, 0.0);
    assert_eq!(anywhere, vec!["あ「", "ああ"]);
    let normal = wrap_text(face, "あ「ああ", 10.0, 25.0, LineBreak::Normal, 0.0);
    assert_eq!(normal, vec!["あ", "「ああ"]);
}

#[test]
fn kinsoku_loops_until_the_edge_is_clean() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // Two trailing openers force the pull loop to run twice on one pair.
    let normal = wrap_text(face, "あ「「ああ", 10.0, 35.0, LineBreak::Normal, 0.0);
    assert_eq!(normal, vec!["あ", "「「ああ"]);
}

#[test]
fn kinsoku_never_empties_a_line() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // Line 1 holds a single char, so the prohibited `。` on line 2
    // cannot be fixed without losing text — the violation is kept.
    let normal = wrap_text(face, "あ。", 10.0, 10.0, LineBreak::Normal, 0.0);
    assert_eq!(normal, vec!["あ", "。"]);
}

#[test]
fn kinsoku_does_not_cross_paragraph_breaks() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // The `。` is fixed within its own paragraph; the `\n` boundary is
    // never crossed.
    let normal = wrap_text(face, "ああ。\nあ", 10.0, 25.0, LineBreak::Normal, 0.0);
    assert_eq!(normal, vec!["あ", "あ。", "あ"]);
}

#[test]
fn letter_spacing_moves_the_wrap_point() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // 25pt fits two 10pt full-width chars exactly; +3pt per char makes
    // each char 13pt so only one fits per line.
    let unspaced = wrap_text(face, "あいうえ", 10.0, 25.0, LineBreak::Anywhere, 0.0);
    assert_eq!(unspaced, vec!["あい", "うえ"]);
    let spaced = wrap_text(face, "あいうえ", 10.0, 25.0, LineBreak::Anywhere, 3.0);
    assert_eq!(spaced, vec!["あ", "い", "う", "え"]);
    // Negative spacing tightens: three 10pt chars at -2pt fit in 25pt.
    let tightened = wrap_text(face, "あいうえ", 10.0, 25.0, LineBreak::Anywhere, -2.0);
    assert_eq!(tightened, vec!["あいう", "え"]);
}

#[test]
fn strict_holds_small_kana_off_a_line_start() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // Greedy wrap alone puts the small `っ` at the head of line 2.
    let anywhere = wrap_text(face, "ああっあ", 10.0, 25.0, LineBreak::Anywhere, 0.0);
    assert_eq!(anywhere, vec!["ああ", "っあ"]);
    // `normal` (CSS-realigned) leaves small kana alone — no pull-down.
    let normal = wrap_text(face, "ああっあ", 10.0, 25.0, LineBreak::Normal, 0.0);
    assert_eq!(normal, vec!["ああ", "っあ"]);
    // `strict` pushes the preceding char down so `っ` is not a line head.
    let strict = wrap_text(face, "ああっあ", 10.0, 25.0, LineBreak::Strict, 0.0);
    assert_eq!(strict, vec!["あ", "あっあ"]);
}

#[test]
fn prolonged_sound_mark_follows_the_same_strict_only_rule() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // `ー` at a line head: allowed under normal, prohibited under strict.
    let normal = wrap_text(face, "ああーあ", 10.0, 25.0, LineBreak::Normal, 0.0);
    assert_eq!(normal, vec!["ああ", "ーあ"]);
    let strict = wrap_text(face, "ああーあ", 10.0, 25.0, LineBreak::Strict, 0.0);
    assert_eq!(strict, vec!["あ", "あーあ"]);
}

#[test]
fn loose_frees_separators_and_iteration_marks_that_normal_holds() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // The katakana middle dot `・`: normal keeps it off a line head,
    // loose lets it start a line.
    let normal = wrap_text(face, "ああ・あ", 10.0, 25.0, LineBreak::Normal, 0.0);
    assert_eq!(normal, vec!["あ", "あ・あ"]);
    let loose = wrap_text(face, "ああ・あ", 10.0, 25.0, LineBreak::Loose, 0.0);
    assert_eq!(loose, vec!["ああ", "・あ"]);
}

#[test]
fn every_mode_keeps_full_stops_off_a_line_start() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // `。` is never relaxed: pulled down under normal, strict AND loose.
    for mode in [LineBreak::Normal, LineBreak::Strict, LineBreak::Loose] {
        let lines = wrap_text(face, "ああ。あ", 10.0, 25.0, mode, 0.0);
        assert_eq!(lines, vec!["あ", "あ。あ"], "mode {mode:?}");
    }
}

#[test]
fn all_prohibited_line_start_paragraph_terminates_without_losing_text() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // 10k chars that may never start a line: every wrapped line head is a
    // violation kinsoku cannot fix without emptying a line. The pass must
    // terminate (each pull strictly shrinks the earlier line, floor 1)
    // and keep every char.
    let text = "、".repeat(10_000);
    for mode in [LineBreak::Normal, LineBreak::Strict, LineBreak::Loose] {
        let lines = wrap_text(face, &text, 10.0, 25.0, mode, 0.0);
        let total: usize = lines.iter().map(|l| l.chars().count()).sum();
        assert_eq!(total, 10_000, "mode {mode:?}");
        assert!(lines.iter().all(|l| !l.is_empty()), "mode {mode:?}");
    }
}

#[test]
fn all_prohibited_line_end_paragraph_terminates_without_losing_text() {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    // Same invariant for the line-end class: every line ends in `「`.
    let text = "「".repeat(10_000);
    let lines = wrap_text(face, &text, 10.0, 25.0, LineBreak::Strict, 0.0);
    let total: usize = lines.iter().map(|l| l.chars().count()).sum();
    assert_eq!(total, 10_000);
    assert!(lines.iter().all(|l| !l.is_empty()));
}

#[test]
fn is_cjk_classification() {
    assert!(is_cjk('あ'));
    assert!(is_cjk('漢'));
    assert!(is_cjk('ア'));
    assert!(is_cjk('Ｗ')); // full-width
    assert!(!is_cjk('a'));
    assert!(!is_cjk('1'));
    assert!(!is_cjk(' '));
}
