//! Unit tests for styled-span wrapping: cross-span words, per-span
//! metrics, kinsoku across span boundaries, and piece merging.

use super::*;
use crate::font::test_support::ja_store;

fn fixed<'a>() -> Vec<&'a crate::font::FontFace> {
    // Fixed pitch: every full-width glyph is exactly 1em, Latin ~0.5em.
    vec![ja_store().get("biz-ud-gothic").unwrap()]
}

fn span<'a>(text: &'a str, faces: &'a [&'a crate::font::FontFace], size: f64) -> RichSpan<'a> {
    RichSpan {
        text,
        faces,
        size,
        letter_spacing: 0.0,
        orient: None,
        combine: None,
    }
}

fn line_texts(lines: &[Vec<RichPiece>]) -> Vec<String> {
    lines
        .iter()
        .map(|l| l.iter().map(|p| p.text.as_str()).collect())
        .collect()
}

#[test]
fn word_crossing_a_span_boundary_stays_together() {
    let faces = fixed();
    // "aa" + "aa aa" joins to the words "aaaa" and "aa"; a width that
    // fits 4 Latin chars must not break inside the cross-span word.
    let spans = [span("aa", &faces, 10.0), span("aa aa", &faces, 10.0)];
    let char_w = faces[0].text_width("a", 10.0, 0.0);
    let lines = wrap_spans(&spans, char_w * 4.0 + 0.5, LineBreak::Normal);
    assert_eq!(line_texts(&lines), vec!["aaaa", "aa"]);
    // The first line is two pieces (one per span), merged per span.
    assert_eq!(lines[0].len(), 2);
    assert_eq!(
        lines[0][0],
        RichPiece {
            span: 0,
            text: "aa".into()
        }
    );
    assert_eq!(
        lines[0][1],
        RichPiece {
            span: 1,
            text: "aa".into()
        }
    );
    assert_eq!(
        lines[1],
        vec![RichPiece {
            span: 1,
            text: "aa".into()
        }]
    );
}

#[test]
fn each_span_measures_at_its_own_size() {
    let faces = fixed();
    // Full-width chars: 1em each. 2 chars at 10pt + 1 char at 20pt =
    // 40pt total; a 30pt line fits the 10pt pair plus nothing.
    let spans = [span("ああ", &faces, 10.0), span("あ", &faces, 20.0)];
    let lines = wrap_spans(&spans, 30.0, LineBreak::Anywhere);
    assert_eq!(line_texts(&lines), vec!["ああ", "あ"]);
    assert_eq!(lines[1][0].span, 1);
}

#[test]
fn kinsoku_moves_chars_across_span_boundaries() {
    let faces = fixed();
    // Greedy puts the second span's `。` at a line head; kinsoku pulls
    // the previous span's last char down with it.
    let spans = [span("ああ", &faces, 10.0), span("。あ", &faces, 10.0)];
    let normal = wrap_spans(&spans, 25.0, LineBreak::Normal);
    assert_eq!(line_texts(&normal), vec!["あ", "あ。あ"]);
    // The moved char keeps its own span (piece order reflects origin).
    assert_eq!(
        normal[1],
        vec![
            RichPiece {
                span: 0,
                text: "あ".into()
            },
            RichPiece {
                span: 1,
                text: "。あ".into()
            },
        ]
    );
    let anywhere = wrap_spans(&spans, 25.0, LineBreak::Anywhere);
    assert_eq!(line_texts(&anywhere), vec!["ああ", "。あ"]);
}

#[test]
fn strict_mode_kinsoku_also_crosses_span_boundaries() {
    let faces = fixed();
    // The small `っ` heads the second span: strict pulls the first
    // span's last char down; normal (CSS-aligned) leaves the break.
    let spans = [span("ああ", &faces, 10.0), span("っあ", &faces, 10.0)];
    let strict = wrap_spans(&spans, 25.0, LineBreak::Strict);
    assert_eq!(line_texts(&strict), vec!["あ", "あっあ"]);
    let normal = wrap_spans(&spans, 25.0, LineBreak::Normal);
    assert_eq!(line_texts(&normal), vec!["ああ", "っあ"]);
}

#[test]
fn newlines_split_paragraphs_wherever_the_span_puts_them() {
    let faces = fixed();
    let spans = [span("a\nb", &faces, 10.0), span("c", &faces, 10.0)];
    let lines = wrap_spans(&spans, 100.0, LineBreak::Normal);
    assert_eq!(line_texts(&lines), vec!["a", "bc"]);
}

#[test]
fn empty_input_is_one_empty_line() {
    let faces = fixed();
    let spans = [span("", &faces, 10.0)];
    let lines = wrap_spans(&spans, 100.0, LineBreak::Normal);
    assert_eq!(lines.len(), 1);
    assert!(lines[0].is_empty());
}

#[test]
fn oversized_cross_span_word_hard_breaks_per_char() {
    let faces = fixed();
    let char_w = faces[0].text_width("a", 10.0, 0.0);
    let spans = [span("aaaaa", &faces, 10.0), span("aaaaa", &faces, 10.0)];
    let lines = wrap_spans(&spans, char_w * 3.5, LineBreak::Normal);
    assert!(lines.len() >= 3, "expected hard break, got {lines:?}");
    let texts = line_texts(&lines);
    assert!(texts.iter().all(|l| l.chars().count() <= 3));
    // No text lost.
    assert_eq!(texts.concat(), "aaaaaaaaaa");
}

#[test]
fn trailing_spaces_are_trimmed_but_interior_kept() {
    let faces = fixed();
    let spans = [span("aa ", &faces, 10.0), span(" aa  ", &faces, 10.0)];
    let lines = wrap_spans(&spans, 1000.0, LineBreak::Normal);
    assert_eq!(line_texts(&lines), vec!["aa  aa"]);
}

#[test]
fn leading_spaces_never_start_a_line() {
    let faces = fixed();
    // A paragraph-leading space is dropped (it would indent the line);
    // the same rule applies after a wrap.
    let spans = [span("  aa", &faces, 10.0)];
    let lines = wrap_spans(&spans, 1000.0, LineBreak::Normal);
    assert_eq!(line_texts(&lines), vec!["aa"]);
}

#[test]
fn token_width_measures_a_digit_group_as_one_cell() {
    let faces = fixed();
    let mut s = span("あ123い", &faces, 10.0);
    s.orient = Some(shojiku_core::TextOrientation::Mixed);
    s.combine = Some(shojiku_core::TextCombine::Digits(3));
    let spans = [s];
    // The whole-token measure: あ (1em) + the combined cell (1em) +
    // い (1em) — the three halfwidth digits would be 1.5em uncombined.
    let piece: Vec<Styled> = "あ123い".chars().map(|c| (c, 0)).collect();
    let w = width::token_width(&spans, &piece);
    assert!((w - 30.0).abs() < 1e-9, "got {w}");
}

#[test]
fn token_width_leaves_over_long_runs_per_char() {
    let faces = fixed();
    let mut s = span("1234", &faces, 10.0);
    s.orient = Some(shojiku_core::TextOrientation::Mixed);
    s.combine = Some(shojiku_core::TextCombine::Digits(3));
    let spans = [s];
    let piece: Vec<Styled> = "1234".chars().map(|c| (c, 0)).collect();
    // Four rotated digits measure per char — no combining, so the token
    // equals its per-char sum exactly.
    let per_char: f64 = piece.iter().map(|&c| width::width_of(&spans, c)).sum();
    let w = width::token_width(&spans, &piece);
    assert!((w - per_char).abs() < 1e-9, "got {w} vs {per_char}");
}

#[test]
fn token_width_without_combine_matches_per_char() {
    let faces = fixed();
    let mut s = span("12", &faces, 10.0);
    s.orient = Some(shojiku_core::TextOrientation::Mixed);
    let spans = [s];
    let piece: Vec<Styled> = "12".chars().map(|c| (c, 0)).collect();
    let per_char: f64 = piece.iter().map(|&c| width::width_of(&spans, c)).sum();
    let w = width::token_width(&spans, &piece);
    assert!((w - per_char).abs() < 1e-9);
}

#[test]
fn an_oversized_all_span_takes_its_own_line_after_pending_content() {
    // 縦中横 `all` measures one 1em cell; a line narrower than the cell
    // cannot hold it, but the atomic token still places WHOLE on its own
    // line after the pending char is flushed (never hard-broken).
    let faces = fixed();
    let mut all = span("12", &faces, 10.0);
    all.orient = Some(shojiku_core::TextOrientation::Mixed);
    all.combine = Some(shojiku_core::TextCombine::All);
    let mut lead = span("あ", &faces, 10.0);
    lead.orient = Some(shojiku_core::TextOrientation::Mixed);
    let spans = [lead, all];
    let lines = wrap_spans(&spans, 8.0, LineBreak::Normal);
    assert_eq!(line_texts(&lines), vec!["あ", "12"]);
}

#[test]
fn an_oversized_all_span_first_never_opens_an_empty_line() {
    let faces = fixed();
    let mut all = span("12", &faces, 10.0);
    all.orient = Some(shojiku_core::TextOrientation::Mixed);
    all.combine = Some(shojiku_core::TextCombine::All);
    let spans = [all];
    let lines = wrap_spans(&spans, 8.0, LineBreak::Normal);
    assert_eq!(line_texts(&lines), vec!["12"]);
}
