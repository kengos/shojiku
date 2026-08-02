//! Unit tests for the hanging-punctuation pass over styled-char lines:
//! the one-pull-per-line bound, the hangable lookahead (a comma glued to a
//! closing bracket stays for kinsoku), and the per-mode hung flags.

use super::*;
use shojiku_core::HangingPunctuation::{AllowEnd, ForceEnd, None as NoHang};
use shojiku_core::LineBreak::Normal;

/// Build a line of single-span styled chars.
fn line(s: &str) -> Vec<Styled> {
    s.chars().map(|c| (c, 0usize)).collect()
}

fn text(l: &[Styled]) -> String {
    l.iter().map(|&(c, _)| c).collect()
}

#[test]
fn enabled_is_true_for_both_hanging_modes() {
    assert!(!enabled(NoHang));
    assert!(enabled(AllowEnd));
    assert!(enabled(ForceEnd));
}

#[test]
fn none_leaves_lines_and_marks_nothing_hung() {
    let mut lines = vec![line("あ"), line("、い")];
    let hung = apply_hang(&mut lines, NoHang, Normal);
    assert_eq!(hung, vec![false, false]);
    assert_eq!(text(&lines[1]), "、い");
}

#[test]
fn allow_end_pulls_a_leading_comma_up_and_hangs_it() {
    // "あ" / "、い" -> the comma hangs on the first line.
    let mut lines = vec![line("あ"), line("、い")];
    let hung = apply_hang(&mut lines, AllowEnd, Normal);
    assert_eq!(text(&lines[0]), "あ、");
    assert_eq!(text(&lines[1]), "い");
    assert_eq!(hung, vec![true, false]);
}

#[test]
fn a_comma_only_next_line_is_pulled_up_and_dropped() {
    // "あ" / "、" -> the whole second line hangs up, reducing the count.
    let mut lines = vec![line("あ"), line("、")];
    let hung = apply_hang(&mut lines, AllowEnd, Normal);
    assert_eq!(lines.len(), 1);
    assert_eq!(text(&lines[0]), "あ、");
    assert_eq!(hung, vec![true]);
}

#[test]
fn a_line_receives_at_most_one_hung_char() {
    // Standard ぶら下げ hangs a single character: after "あ" swallows the
    // comma-only line, the next comma-only line must NOT also merge up —
    // the receiver's one-pull budget is spent.
    let mut lines = vec![line("あ"), line("、"), line("、")];
    let hung = apply_hang(&mut lines, AllowEnd, Normal);
    assert_eq!(lines.len(), 2);
    assert_eq!(text(&lines[0]), "あ、");
    assert_eq!(text(&lines[1]), "、");
    assert_eq!(hung, vec![true, false]);
}

#[test]
fn a_comma_run_head_is_not_hangable_and_stays() {
    // "、、い": pulling the first comma would expose another prohibited
    // char, so the head is not hangable — kinsoku push-out owns it.
    let mut lines = vec![line("あ"), line("、、い")];
    let hung = apply_hang(&mut lines, AllowEnd, Normal);
    assert_eq!(text(&lines[0]), "あ");
    assert_eq!(text(&lines[1]), "、、い");
    assert_eq!(hung, vec![false, false]);
}

#[test]
fn a_full_stop_glued_to_a_closing_bracket_is_not_hangable() {
    // "。」あ" (the 「…。」 closing-quote pattern): hanging 。 would leave
    // 」 at the line head — a prohibited start — so the hang pass refuses
    // and the whole cluster is kinsoku's to push out.
    let mut lines = vec![line("だ"), line("。」あ")];
    let hung = apply_hang(&mut lines, AllowEnd, Normal);
    assert_eq!(text(&lines[1]), "。」あ");
    assert_eq!(hung, vec![false, false]);
}

#[test]
fn force_end_hangs_a_trailing_comma_that_merely_fit() {
    // A single line ending in a comma: force_end excludes it from
    // alignment, allow_end does not (it did not overflow).
    let mut f = vec![line("あ、")];
    assert_eq!(apply_hang(&mut f, ForceEnd, Normal), vec![true]);
    let mut a = vec![line("あ、")];
    assert_eq!(apply_hang(&mut a, AllowEnd, Normal), vec![false]);
}

#[test]
fn a_comma_at_the_very_first_line_start_is_left_alone() {
    // Nothing precedes the first line, so its leading comma cannot hang up.
    let mut lines = vec![line("、あ")];
    let hung = apply_hang(&mut lines, AllowEnd, Normal);
    assert_eq!(text(&lines[0]), "、あ");
    assert_eq!(hung, vec![false]);
}

#[test]
fn a_non_punctuation_line_start_is_not_pulled() {
    let mut lines = vec![line("あ"), line("いう")];
    let hung = apply_hang(&mut lines, AllowEnd, Normal);
    assert_eq!(text(&lines[1]), "いう");
    assert_eq!(hung, vec![false, false]);
}
