//! Thai word segmentation for line breaking.
//!
//! Thai writes without inter-word spaces, so the tokenizer in
//! [`super::rich::token`] sees a whole Thai paragraph as one unbreakable
//! word and the greedy wrapper falls through to its last resort, breaking
//! per character — which lands inside words and, worse, between a base
//! character and the vowel or tone mark that belongs to it. ICU4X's line
//! segmenter supplies the break opportunities a space would otherwise mark.
//!
//! Scoped to Thai on purpose. The same ICU data also covers Lao, Khmer and
//! Myanmar at no extra size, but Shojiku ships no font pack, locale pack or
//! rendered example for those, and a shipped locale here carries a document
//! proof. [`is_thai`] is the single place the range lives, so adding a
//! script later is a change to one function.

use icu_segmenter::LineSegmenter;
use std::collections::BTreeSet;

/// Whether `c` is in the Thai block (U+0E00–U+0E7F). Used only to decide
/// whether a word is worth segmenting, so it is deliberately the whole
/// block rather than the letters: the digits ๐–๙ and the baht sign ฿ are
/// in it too, and a `฿1,234.00` amount therefore takes the segmenting
/// path. That costs one segmenter call and finds no break, which is the
/// right answer — narrowing the range to letters would be an
/// optimization, not a correctness fix.
pub(super) fn is_thai(c: char) -> bool {
    ('\u{0E00}'..='\u{0E7F}').contains(&c)
}

/// Whether `c` is one of Thai's five LEADING vowels (U+0E40–U+0E44:
/// เ แ โ ใ ไ). These are written BEFORE the consonant they are pronounced
/// after, so a line may not end with one — the mirror of
/// [`is_thai_combining`], which keeps a line from starting with a mark.
/// Both halves are needed: the hard-break arm walks a word character by
/// character and can otherwise cut on either side of a cluster.
pub(super) fn is_thai_leading_vowel(c: char) -> bool {
    ('\u{0E40}'..='\u{0E44}').contains(&c)
}

/// Whether `c` is a Thai vowel or tone mark that attaches to the character
/// before it: the above/below vowels (U+0E31, U+0E34–U+0E3A) and the tone
/// marks and diacritics (U+0E47–U+0E4E). A line must never begin with one —
/// it would be drawn detached from the base it modifies.
pub(super) fn is_thai_combining(c: char) -> bool {
    matches!(c, '\u{0E31}' | '\u{0E34}'..='\u{0E3A}' | '\u{0E47}'..='\u{0E4E}')
}

/// The CHAR indices at which `text` may break, interior positions only —
/// the leading and trailing boundaries every segmenter reports are not
/// break opportunities and are dropped.
///
/// ICU reports BYTE offsets; the wrapper works in characters. Collecting
/// the offsets and then walking the string's character starts converts one
/// into the other without ever indexing `text` by byte — so an offset the
/// segmenter and the string disagreed about could only cost a break that
/// is not taken, never a panic. The set holds one entry per word, not per
/// character.
///
/// Both ends fall out rather than being special-cased: `char_indices`
/// never yields `text.len()`, so the trailing boundary matches nothing,
/// and the leading one is the only index that can be 0.
pub(super) fn break_indices(text: &str) -> Vec<usize> {
    let offsets: BTreeSet<usize> = LineSegmenter::new_lstm(Default::default())
        .segment_str(text)
        .collect();
    text.char_indices()
        .enumerate()
        .filter(|&(index, (byte, _))| index > 0 && offsets.contains(&byte))
        .map(|(index, _)| index)
        .collect()
}

#[cfg(test)]
mod tests;
