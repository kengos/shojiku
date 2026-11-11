//! The ellipsis clamp must return exactly what the original
//! one-shaping-per-removed-char implementation returned, for every input
//! short enough that the shaping bound is never reached. The original is
//! kept in this file as `reference_clamp`.

use super::*;
use crate::font::test_support::ja_store;
use crate::fuzz::test_chain;
use crate::wrap::{no_line_end, wrap_text_chain};

/// The clamp as it was before the cut-point search: trims the last kept
/// line one char at a time, shaping the whole remaining prefix each time.
fn reference_clamp(
    chain: &[&FontFace],
    mut lines: Vec<String>,
    size: f64,
    letter_spacing: f64,
    content_w: f64,
    max_lines: usize,
) -> Vec<String> {
    const ELLIPSIS: char = '…';
    lines.truncate(max_lines);
    let Some(last) = lines.last_mut() else {
        return lines;
    };
    let ellipsis_w = run_width(
        chain,
        &ELLIPSIS.to_string(),
        size,
        RunOptions::spacing_only(letter_spacing),
    );
    loop {
        let trimmed = last.trim_end();
        let fits = !exceeds(
            run_width(
                chain,
                trimmed,
                size,
                RunOptions::spacing_only(letter_spacing),
            ) + ellipsis_w,
            content_w,
        );
        let ends_prohibited = trimmed.chars().next_back().is_some_and(no_line_end);
        if (fits && !ends_prohibited) || trimmed.is_empty() {
            let mut clamped = trimmed.to_string();
            clamped.push(ELLIPSIS);
            *last = clamped;
            return lines;
        }
        last.truncate(trimmed.len() - trimmed.chars().next_back().map_or(0, char::len_utf8));
    }
}

/// A fixed-seed xorshift generator: the same inputs on every run.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

/// Pieces the generated lines are built from: Japanese, kerned and
/// ligature-prone Latin, combining marks, a ZWJ emoji sequence, a char
/// only the fallback face covers, chars no face covers, opening
/// brackets and quotes (line-end prohibited), and spaces (U+0020 and
/// U+3000).
const PIECES: &[&str] = &[
    "あ",
    "い",
    "漢",
    "字",
    "A",
    "V",
    "T",
    "o",
    "f",
    "i",
    "fi",
    "ffl",
    " ",
    " ",
    "\u{3000}",
    "e\u{301}",
    "a\u{308}\u{301}",
    "👨\u{200d}👩\u{200d}👧",
    "𠮷",
    "\u{10FFFF}",
    "「",
    "（",
    "“",
    "1",
    "،",
    "م",
    "AV",
    "Wa",
    "office",
    "ก",
    "ภาษา",
    "क्षि",
];

const SPACINGS: &[f64] = &[0.0, 0.0, -2.0, 0.5, 3.0, 40.0, -9.5];
const WIDTHS: &[f64] = &[0.5, 5.0, 14.0, 33.0, 80.0, 200.0];

/// Asserts the clamp of `lines` equals the reference and that the shaping
/// bound was not reached (the equality only holds below the bound).
fn assert_same_as_reference(
    chain: &[&FontFace],
    lines: &[String],
    (spacing, width, max_lines): (f64, f64, usize),
    context: &str,
) {
    let expected = reference_clamp(chain, lines.to_vec(), 10.0, spacing, width, max_lines);
    let actual =
        clamp_with_ellipsis_checked(chain, lines.to_vec(), 10.0, spacing, width, max_lines);
    assert!(
        !actual.bound_reached,
        "the shaping bound was reached: {context}"
    );
    assert_eq!(
        actual.lines, expected,
        "{context}, spacing {spacing}, width {width}, max_lines {max_lines}"
    );
}

#[test]
fn the_clamp_returns_what_the_one_shaping_per_char_clamp_returned() {
    let store = ja_store();
    let primary = store.get("biz-udp-gothic").unwrap();
    let fallback = store.get("ipamj-mincho").unwrap();
    let single = [primary];
    let chained = [primary, fallback];
    // The fuzz font chain (`test_chain`) covers Latin with kerning and
    // ligatures, Japanese, Thai and Devanagari.
    let noto: Vec<&FontFace> = test_chain().iter().collect();
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    for case in 0..600 {
        let chain: &[&FontFace] = match case % 3 {
            0 => &single,
            1 => &chained,
            _ => &noto,
        };
        let pieces = 1 + rng.below(25);
        let text: String = (0..pieces)
            .map(|_| PIECES[rng.below(PIECES.len())])
            .collect();
        let spacing = SPACINGS[rng.below(SPACINGS.len())];
        let width = WIDTHS[rng.below(WIDTHS.len())];
        let max_lines = 1 + rng.below(3);
        let lines = wrap_text_chain(chain, &text, 10.0, width, LineBreak::Normal, spacing);
        assert_same_as_reference(
            chain,
            &lines,
            (spacing, width, max_lines),
            &format!("text {text:?}, chain of {}", chain.len()),
        );
    }
}

#[test]
fn a_line_that_starts_with_many_common_chars_keeps_the_text_that_fits() {
    let store = ja_store();
    let face = store.face(None);
    // Digits are Common: they do not decide the script, so the script is
    // decided only by "あ" at the end. The cut points among the digits
    // still have known widths.
    let line = format!("{}あ", "1".repeat(200));
    for width in [40.0, 400.0] {
        assert_same_as_reference(
            &[face],
            std::slice::from_ref(&line),
            (0.0, width, 1),
            "digits",
        );
    }
    let clamped = clamp_with_ellipsis(&[face], vec![line], 10.0, 0.0, 40.0, 1);
    assert_ne!(clamped, vec!["…".to_string()]);
}
