//! Unit tests for the Thai break-opportunity helpers: the script and
//! combining-mark predicates, and the byte-offset → char-index merge.

use super::*;

/// "ภาษาไทย" — "Thai language", two words with no space between them.
const LANGUAGE: &str = "ภาษาไทย";

#[test]
fn is_thai_covers_the_block_and_nothing_beside_it() {
    assert!(is_thai('ก')); // U+0E01, the first letter
    assert!(is_thai('๙')); // U+0E59, a Thai digit
    assert!(!is_thai('\u{0DFF}')); // just below the block
    assert!(!is_thai('\u{0E80}')); // Lao, just above it
    assert!(!is_thai('a'));
    assert!(!is_thai('あ'));
}

#[test]
fn is_thai_combining_covers_the_vowels_and_tone_marks() {
    assert!(is_thai_combining('\u{0E31}')); // MAI HAN-AKAT
    assert!(is_thai_combining('\u{0E34}')); // SARA I, range start
    assert!(is_thai_combining('\u{0E3A}')); // PHINTHU, range end
    assert!(is_thai_combining('\u{0E47}')); // MAITAIKHU, range start
    assert!(is_thai_combining('\u{0E4E}')); // YAMAKKAN, range end

    // Base consonants, and vowels written in line, are NOT combining.
    assert!(!is_thai_combining('ก'));
    assert!(!is_thai_combining('\u{0E30}')); // SARA A sits on the line
    assert!(!is_thai_combining('\u{0E3B}')); // unassigned, between the ranges
    assert!(!is_thai_combining('a'));
}

#[test]
fn break_indices_finds_the_word_boundary_inside_a_thai_run() {
    // ภาษา ("language") + ไทย ("Thai"): one interior boundary, at char 4.
    assert_eq!(break_indices(LANGUAGE), vec![4]);
}

#[test]
fn break_indices_are_char_positions_not_byte_offsets() {
    // Every character here is three bytes, so a byte offset would be 12.
    let at = break_indices(LANGUAGE);
    assert_eq!(at, vec![4]);
    assert!(
        LANGUAGE.len() > LANGUAGE.chars().count(),
        "multi-byte fixture"
    );
}

#[test]
fn break_indices_drops_the_leading_and_trailing_boundaries() {
    // A single word has no INTERIOR boundary, though the segmenter still
    // reports the string's two ends.
    assert!(break_indices("ไทย").is_empty());
}

#[test]
fn break_indices_of_empty_and_single_char_text_is_empty() {
    assert!(break_indices("").is_empty());
    assert!(break_indices("ก").is_empty());
}

#[test]
fn break_indices_never_splits_a_base_from_its_mark() {
    // สวัสดี — the mark U+0E31 sits at index 2 and U+0E35 at index 5.
    // Non-emptiness first: a `for` over an empty result asserts nothing,
    // so an implementation that never found a break would pass this.
    assert!(!break_indices("สวัสดีครับ").is_empty(), "the fixture breaks");
    for at in break_indices("สวัสดีครับ") {
        let next = "สวัสดีครับ".chars().nth(at).expect("in range");
        assert!(
            !is_thai_combining(next),
            "a break at {at} would leave a mark heading the line",
        );
    }
}

#[test]
fn break_indices_of_text_with_no_thai_has_no_interior_break_inside_a_word() {
    // The helper is only ever called on a word (no spaces), and a Latin word
    // is one unit — so the caller's non-Thai fast path is not load-bearing
    // for correctness, only for leaving existing documents untouched.
    assert!(break_indices("hello").is_empty());
}

#[test]
fn a_script_change_is_not_itself_a_break_opportunity() {
    // UAX #14 offers no break between a Latin letter and the Thai word
    // glued to it — both resolve to the same "letter" class. Pinned
    // because it is the opposite of the intuitive answer, and because the
    // next test shows the Thai word boundaries still apply around it.
    assert_eq!(break_indices("abcไทย"), Vec::<usize>::new());
}

#[test]
fn a_latin_prefix_does_not_suppress_the_thai_word_boundaries() {
    // "abc" + ภาษา + ไทย: the interior Thai boundary is still found, at
    // char 7, even though the run starts in another script.
    assert_eq!(break_indices("abcภาษาไทย"), vec![7]);
}

#[test]
fn break_indices_survives_zero_width_and_bidi_formatting_characters() {
    // Hostile input: formatting characters carry no width and must not
    // desynchronize the byte→char merge or panic.
    let text = "ภาษา\u{200B}\u{202E}ไทย";
    let at = break_indices(text);
    // Same trap as above: without this the loop body never runs and the
    // formatting characters would be "survived" by finding nothing.
    assert!(!at.is_empty(), "the two Thai words still break apart");
    for at in at {
        assert!(at > 0 && at < text.chars().count(), "index {at} in range");
    }
}

#[test]
fn break_indices_finishes_a_params_length_run() {
    // A params-length Thai run. This is a LIVENESS check, not a complexity
    // measurement — it would pass under any implementation that finishes,
    // and the honest cost is one pass over the characters with a lookup
    // per character into a set holding one entry per WORD, so O(n log w).
    // What it does rule out is the shape that motivated the set: turning
    // each byte offset into a char index by rescanning the string, which
    // is quadratic and does not finish this in reasonable time.
    let text = LANGUAGE.repeat(3_000);
    let at = break_indices(&text);
    assert!(!at.is_empty(), "a repeated phrase breaks somewhere");
    let total = text.chars().count();
    assert!(at.iter().all(|&i| i > 0 && i < total), "all interior");
    assert!(at.windows(2).all(|w| w[0] < w[1]), "strictly ascending");
}
