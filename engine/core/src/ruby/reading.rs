//! The `《…》` machinery: capturing a reading, choosing the base run it
//! annotates, and validating the pair. Every rejection leaves the
//! characters literal, so untrusted content never loses text here.

use super::{RubyWarning, MAX_RUBY_LEN};

/// Reads a `《…》` body; the caller has consumed the opener. The closing
/// bracket is optional — an unclosed reading renders literally, so the
/// scan simply reports whether it closed.
pub(super) fn take_reading(chars: &mut impl Iterator<Item = char>) -> (String, bool) {
    let mut ruby = String::new();
    for c in chars.by_ref() {
        if c == '》' {
            return (ruby, true);
        }
        ruby.push(c);
    }
    (ruby, false)
}

/// Whether a char may carry an *implicit* ruby base (the aozora rule:
/// a bare `《reading》` annotates the maximal preceding kanji run).
fn is_base_kanji(c: char) -> bool {
    // 0x3005..7 = 々〆〇, 0x30F6 = ヶ — the non-range base marks.
    matches!(u32::from(c),
        0x3005..=0x3007
        | 0x30F6
        | 0x3400..=0x4DBF    // CJK ext A
        | 0x4E00..=0x9FFF    // CJK unified
        | 0xF900..=0xFAFF    // CJK compatibility
    )
}

/// The base for a reading: the explicit `|…` text when a bar is pending,
/// else the maximal trailing kanji run of `plain` (falling back to the
/// single trailing char so `船《ふね》` after kana still binds).
pub(super) fn take_base(plain: &mut String, bar: &mut Option<String>) -> String {
    if let Some(base) = bar.take() {
        return base;
    }
    let tail_kanji = plain
        .chars()
        .rev()
        .take_while(|c| is_base_kanji(*c))
        .count();
    let take = match tail_kanji {
        0 => usize::from(!plain.is_empty()),
        n => n,
    };
    let cut = plain
        .char_indices()
        .rev()
        .nth(take.saturating_sub(1))
        .map_or(plain.len(), |(i, _)| i);
    plain.split_off(if take == 0 { plain.len() } else { cut })
}

/// Validates one captured reading; `None` = well-formed.
pub(super) fn check_reading(closed: bool, base: &str, ruby: &str) -> Option<RubyWarning> {
    if !closed {
        return Some(RubyWarning::Unclosed);
    }
    if ruby.is_empty() {
        return Some(RubyWarning::EmptyRuby);
    }
    if base.is_empty() {
        return Some(RubyWarning::NoBase);
    }
    if ruby.chars().count() > MAX_RUBY_LEN {
        return Some(RubyWarning::RubyTooLong);
    }
    None
}
