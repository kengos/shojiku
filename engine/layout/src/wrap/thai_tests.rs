//! Wrapper-level tests for Thai line breaking: the segmenter's word
//! boundaries acting through the tokenizer, the cases where it must NOT
//! act (non-Thai text is untouched), and the adversarial ones — a word
//! wider than the line, an orphan mark, degenerate widths.
//!
//! Box widths are measured from the face rather than assumed: the e2e/unit
//! font store carries no Thai face, so Thai characters draw as `.notdef`
//! and their advance is whatever that glyph declares. Measuring the exact
//! prefix that should fit keeps every golden independent of it.

use super::*;
use crate::font::test_support::ja_store;

/// "ภาษาไทย" — "Thai language": ภาษา + ไทย, no space between the words.
const LANGUAGE: &str = "ภาษาไทย";
/// The first word alone, four characters.
const FIRST: &str = "ภาษา";

fn face() -> &'static FontFace {
    ja_store().get("biz-ud-gothic").expect("biz-ud-gothic face")
}

/// Width of `text` at 10pt through the test face.
fn width(text: &str) -> f64 {
    face().text_width(text, 10.0, 0.0)
}

fn wrap(text: &str, max_width: f64, lb: LineBreak) -> Vec<String> {
    wrap_text(face(), text, 10.0, max_width, lb, 0.0)
}

#[test]
fn a_thai_run_breaks_at_a_word_boundary() {
    // Without segmentation the whole run is one token: it would either
    // overflow whole or hard-break mid-word at exactly the width limit.
    let lines = wrap(LANGUAGE, width(FIRST) + 0.5, LineBreak::Normal);
    assert_eq!(lines, vec!["ภาษา".to_string(), "ไทย".to_string()]);
}

#[test]
fn a_thai_run_that_fits_is_not_split() {
    let lines = wrap(LANGUAGE, width(LANGUAGE) + 0.5, LineBreak::Normal);
    assert_eq!(lines, vec![LANGUAGE.to_string()]);
}

#[test]
fn no_character_is_lost_however_narrow_the_box() {
    for chars in 1..=7 {
        let w = f64::from(chars) * width("ก");
        let lines = wrap(LANGUAGE, w, LineBreak::Normal);
        assert_eq!(lines.concat(), LANGUAGE, "at {chars} chars wide");
    }
}

#[test]
fn a_box_too_narrow_for_one_word_degrades_to_a_per_character_break() {
    // Concatenation equality (above) holds for ANY partition, so it does
    // not say WHERE the degraded path breaks. This pins the value: at two
    // characters' width the run is cut every two characters, except where
    // a cluster rule moves the break — ไ is a leading vowel, so the line
    // before it may not end on it and ไท travel together.
    let lines = wrap(LANGUAGE, 2.0 * width("ก") + 0.5, LineBreak::Normal);
    assert_eq!(
        lines,
        vec![
            "ภา".to_string(),
            "ษา".to_string(),
            "ไท".to_string(),
            "ย".to_string(),
        ],
    );
}

#[test]
fn a_latin_prefix_still_breaks_at_the_thai_word_boundary() {
    // The tokenizer accumulates Latin and Thai as ONE word (neither is a
    // space nor CJK), so this breaks only because the segmenter says it
    // may — and it says so at the Thai word boundary, not at the script
    // change, which UAX #14 does not offer as a break opportunity.
    let text = "abcภาษาไทย";
    let lines = wrap(text, width("abcภาษา") + 0.5, LineBreak::Normal);
    assert_eq!(lines, vec!["abcภาษา".to_string(), "ไทย".to_string()]);
}

#[test]
fn segmentation_survives_a_span_boundary() {
    // Tokens are built over the JOINED text, so the segmenter sees the
    // whole word even though it arrives in two spans — and each piece
    // comes back tagged with the span it came from.
    let faces = vec![face()];
    let spans = [
        RichSpan {
            text: "ภา",
            faces: &faces,
            size: 10.0,
            letter_spacing: 0.0,
            orient: None,
            combine: None,
        },
        RichSpan {
            text: "ษาไทย",
            faces: &faces,
            size: 10.0,
            letter_spacing: 0.0,
            orient: None,
            combine: None,
        },
    ];
    let lines = wrap_spans(&spans, width(FIRST) + 0.5, LineBreak::Normal);
    let texts: Vec<String> = lines
        .iter()
        .map(|l| l.iter().map(|p| p.text.as_str()).collect())
        .collect();
    assert_eq!(texts, vec!["ภาษา".to_string(), "ไทย".to_string()]);
    // The first line straddles both spans; the second is span 1 only.
    assert_eq!(lines[0].len(), 2);
    assert_eq!((lines[0][0].span, lines[0][1].span), (0, 1));
    assert_eq!(lines[1][0].span, 1);
}

#[test]
fn vertical_columns_break_at_the_same_word_boundary() {
    // `wrap_vertical` shares the tokenizer, so a column breaks where a
    // line would — measured down instead of across.
    let advance = face().vertical_advance(10.0);
    let cols: Vec<String> = wrap_vertical(
        &[face()],
        LANGUAGE,
        10.0,
        4.0 * advance + 0.4,
        LineBreak::Normal,
        0.0,
        shojiku_core::TextOrientation::Mixed,
        HangingPunctuation::None,
        None,
    )
    .iter()
    .map(WrappedLine::text)
    .collect();
    assert_eq!(cols, vec!["ภาษา".to_string(), "ไทย".to_string()]);
}

#[test]
fn line_break_anywhere_still_segments() {
    // `lineBreak` selects kinsoku strictness; segmentation is a break
    // OPPORTUNITY, not a prohibition, so it applies under every mode —
    // exactly as a Latin word's spaces do.
    let lines = wrap(LANGUAGE, width(FIRST) + 0.5, LineBreak::Anywhere);
    assert_eq!(lines, vec!["ภาษา".to_string(), "ไทย".to_string()]);
}

#[test]
fn latin_text_wraps_exactly_as_before() {
    // The non-Thai path must be untouched: a Latin word never splits, and
    // spaces are still the only break opportunity.
    let lines = wrap("hello world", width("hello") + 0.5, LineBreak::Normal);
    assert_eq!(lines, vec!["hello".to_string(), "world".to_string()]);
    // A word wider than the line still hard-breaks per character.
    let lines = wrap("hello", width("hel") + 0.5, LineBreak::Normal);
    assert_eq!(lines, vec!["hel".to_string(), "lo".to_string()]);
}

#[test]
fn cjk_text_wraps_exactly_as_before() {
    // CJK chars are their own tokens and never reach the word path at all.
    let lines = wrap("あいうえお", 3.0 * width("あ") + 0.5, LineBreak::Normal);
    assert_eq!(lines, vec!["あいう".to_string(), "えお".to_string()]);
}

#[test]
fn a_word_wider_than_the_line_never_leaves_a_mark_heading_one() {
    // สวัสดี carries U+0E31 at index 2 and U+0E35 at index 5. Hard-breaking
    // per character would put one at a line head; the guard holds it back.
    let text = "สวัสดี";
    let lines = wrap(text, width("ก") + 0.5, LineBreak::Normal);
    assert_eq!(lines.concat(), text, "no character may be dropped");
    assert!(
        !lines
            .iter()
            .any(|l| l.chars().next().is_some_and(thai::is_thai_combining)),
        "no line may begin with a combining mark: {lines:?}",
    );
}

#[test]
fn an_orphan_mark_at_the_start_is_placed_and_never_pushed_onto_a_later_line() {
    // Hostile input: a combining mark with nothing to attach to. Nothing
    // may be lost, and the guard must not push it DOWN — a mark at char 0
    // has to head line 1 (there is nothing before it to keep it with), so
    // the testable half of "never opens a line" is that it stays there
    // rather than opening a later one.
    let text = "\u{0E31}ไทย";
    let lines = wrap(text, width("ก") + 0.5, LineBreak::Normal);
    assert_eq!(lines.concat(), text);
    assert!(lines[0].starts_with('\u{0E31}'), "{lines:?}");
    assert!(
        !lines[1..]
            .iter()
            .any(|l| l.chars().next().is_some_and(thai::is_thai_combining)),
        "no LATER line may open with a mark: {lines:?}",
    );
}

#[test]
fn a_run_of_leading_vowels_still_breaks() {
    // Hostile input: เ แ โ ใ ไ are only ever written before a consonant,
    // so a run of them is degenerate. The cluster guard holds a leading
    // vowel to the character AFTER it — if it did so for another leading
    // vowel too, params could drive one unbreakable line of any length.
    let text = "ไ".repeat(40);
    let lines = wrap(&text, 2.0 * width("ก") + 0.5, LineBreak::Normal);
    assert_eq!(lines.concat(), text, "nothing lost");
    assert!(
        lines.len() > 10,
        "the run must still break: {} lines",
        lines.len()
    );
}

#[test]
fn a_leading_vowel_never_ends_a_line() {
    // The mirror of the mark guard: ไ is written before the consonant it
    // is pronounced after, so cutting between them detaches it.
    let text = "ภาษาไทย";
    for chars in 1..=6 {
        let lines = wrap(text, f64::from(chars) * width("ก") + 0.5, LineBreak::Normal);
        assert_eq!(lines.concat(), text, "at {chars} wide");
        assert!(
            !lines.iter().any(|l| l
                .chars()
                .next_back()
                .is_some_and(thai::is_thai_leading_vowel)),
            "no line may end with a leading vowel at {chars} wide: {lines:?}",
        );
    }
}

#[test]
fn degenerate_widths_degrade_instead_of_panicking() {
    for max_width in [0.0, -10.0, f64::NAN] {
        let lines = wrap(LANGUAGE, max_width, LineBreak::Normal);
        assert_eq!(lines.concat(), LANGUAGE, "at max_width {max_width}");
    }
}

#[test]
fn a_params_length_thai_run_wraps_without_hanging() {
    // The segmenter runs once per WORD flush over a single forward pass,
    // so a long run is linear. A quadratic byte→char mapping would not
    // finish this in reasonable time.
    let text = LANGUAGE.repeat(2_000);
    let lines = wrap(&text, 8.0 * width("ก"), LineBreak::Normal);
    assert_eq!(lines.concat(), text);
    assert!(lines.len() > 1_000, "a long run paginates into many lines");
}
