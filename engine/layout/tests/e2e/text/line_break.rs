//! `lineBreak: strict | loose` end to end (`src/style/enums.rs` →
//! `src/wrap/kinsoku.rs`): the wire keyword reaches the wrapper and
//! changes which characters are held off a line start, while the default
//! `normal` follows CSS (small kana may start a line). Thai reaches the
//! same wrapper by a different route (`src/wrap/thai.rs`): it has no
//! spaces, so its break opportunities come from a word segmenter.

use crate::common::*;

/// ภาษา ("language") and ไทย ("Thai") — the two words the Thai fixtures
/// below are built from, so an assertion can name whole words.
const THAI_WORDS: [&str; 2] = ["ภาษา", "ไทย"];

/// One flow text item, `lineBreak` mode selectable. Fixed-pitch
/// `biz-ud-gothic` so every full-width glyph is exactly 1em (10pt) and a
/// 25pt box fits two per line before kinsoku.
fn wrapped(mode: &str, text: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        text: "{text}"
        box: {{ w: 25 }}
        style: {{ fontSize: 10, fontFamily: biz-ud-gothic, lineBreak: {mode} }}
"#
    )
}

#[test]
fn strict_holds_small_kana_off_a_line_start_but_normal_does_not() {
    // Greedy wrap puts the small `っ` at a line head; only `strict` pulls
    // the preceding char down. `normal` (CSS-realigned) leaves it.
    let (normal, dn) = run(&wrapped("normal", "ああっあ"), json!({}));
    let (strict, ds) = run(&wrapped("strict", "ああっあ"), json!({}));
    assert!(!dn.has_errors() && !ds.has_errors());
    assert_eq!(
        line_texts(text_blocks(&normal.pages[0])[0]),
        vec!["ああ", "っあ"]
    );
    assert_eq!(
        line_texts(text_blocks(&strict.pages[0])[0]),
        vec!["あ", "あっあ"]
    );
}

#[test]
fn loose_frees_a_separator_that_normal_holds() {
    // The katakana middle dot `・`: normal keeps it off a line head, loose
    // lets it start a line.
    let (normal, dn) = run(&wrapped("normal", "ああ・あ"), json!({}));
    let (loose, dl) = run(&wrapped("loose", "ああ・あ"), json!({}));
    assert!(!dn.has_errors() && !dl.has_errors());
    assert_eq!(
        line_texts(text_blocks(&normal.pages[0])[0]),
        vec!["あ", "あ・あ"]
    );
    assert_eq!(
        line_texts(text_blocks(&loose.pages[0])[0]),
        vec!["ああ", "・あ"]
    );
}

#[test]
fn a_closing_quote_is_pushed_off_a_line_head() {
    // Chinese quotation marks reach the wrapper as their own tokens when
    // they sit between CJK characters, so `”` can land at a line head —
    // and must not. Held in every mode; `loose` does not free it.
    for mode in ["normal", "loose"] {
        let (doc, diags) = run(&wrapped(mode, "ああ”あ"), json!({}));
        assert!(!diags.has_errors());
        assert_eq!(
            line_texts(text_blocks(&doc.pages[0])[0]),
            vec!["あ", "あ”あ"],
            "under {mode}"
        );
    }
}

#[test]
fn an_opening_quote_is_pushed_off_a_line_end() {
    // The mirror case: `“` fits at the end of the first line, and line-end
    // kinsoku moves it down to stay with what it opens.
    let (doc, diags) = run(&wrapped("normal", "あ“ああ"), json!({}));
    assert!(!diags.has_errors());
    assert_eq!(
        line_texts(text_blocks(&doc.pages[0])[0]),
        vec!["あ", "“ああ"]
    );
}

#[test]
fn the_latin_interpunct_is_not_held_off_a_line_head() {
    // `·` (U+00B7) is UAX #14 class AI — language-dependent, and used as a
    // Latin field separator in the bundled examples — so it is
    // deliberately unclassified. The katakana `・` is the control: same
    // box, same position, and it IS pushed off the line head under
    // `normal`. A 20pt box is what puts the half-width `·` at a head at
    // all (in the 25pt box it still fits on the first line).
    let narrow = |text: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        text: "{text}"
        box: {{ w: 20 }}
        style: {{ fontSize: 10, fontFamily: biz-ud-gothic }}
"#
        )
    };
    let (dot, dd) = run(&narrow("ああ·あ"), json!({}));
    let (kana, dk) = run(&narrow("ああ・あ"), json!({}));
    assert!(!dd.has_errors() && !dk.has_errors());
    assert_eq!(
        line_texts(text_blocks(&dot.pages[0])[0]),
        vec!["ああ", "·あ"],
        "· may head a line"
    );
    assert_eq!(
        line_texts(text_blocks(&kana.pages[0])[0]),
        vec!["あ", "あ・あ"],
        "・ is pushed off the head"
    );
}

#[test]
fn line_break_cascades_from_the_document_defaults() {
    // `defaults.style.lineBreak` is the cascade root: a strict default
    // reaches a text item that sets no lineBreak of its own.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
defaults:
  style: { lineBreak: strict }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        text: "ああっあ"
        box: { w: 25 }
        style: { fontSize: 10, fontFamily: biz-ud-gothic }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    assert_eq!(
        line_texts(text_blocks(&doc.pages[0])[0]),
        vec!["あ", "あっあ"]
    );
}

/// One flow text item at a fixed narrow width. The e2e font store carries
/// only the ja pack, so Thai draws as `.notdef` — deliberately not relied
/// on: the assertions below hold for any advance that pkg face gives it.
fn thai(text: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        text: "{text}"
        box: {{ w: 45 }}
        style: {{ fontSize: 10, fontFamily: biz-ud-gothic }}
"#
    )
}

#[test]
fn thai_breaks_only_at_word_boundaries() {
    // Thai has no spaces, so before segmentation the whole run was ONE
    // token and the greedy fill's last resort cut it per character —
    // mid-word. Every line here must be whole words instead. The
    // assertion names the words rather than a pt width, so it does not
    // depend on what advance the `.notdef` glyph happens to declare.
    let (doc, d) = run(&thai("ภาษาไทยภาษาไทย"), json!({}));
    assert!(!d.has_errors());
    let lines = line_texts(text_blocks(&doc.pages[0])[0]);
    assert!(lines.len() > 1, "a 45pt box must break this run: {lines:?}");
    assert_eq!(lines.concat(), "ภาษาไทยภาษาไทย", "no character may be lost");
    for line in &lines {
        let mut rest = line.as_str();
        while let Some(word) = THAI_WORDS.iter().find(|w| rest.starts_with(**w)) {
            rest = &rest[word.len()..];
        }
        assert!(rest.is_empty(), "line {line:?} is cut mid-word: {lines:?}");
    }
}

#[test]
fn the_same_width_still_hard_breaks_a_latin_word_mid_word() {
    // The control for the test above: 45pt is genuinely too narrow for
    // the run, so "every line is a whole word" is a statement about the
    // segmenter and not about the box being roomy. A Latin word has no
    // interior break opportunity and is cut wherever the width lands.
    let (doc, d) = run(&thai("aaaaaaaaaaaaaaaaaaaaaaaa"), json!({}));
    assert!(!d.has_errors());
    let lines = line_texts(text_blocks(&doc.pages[0])[0]);
    assert!(
        lines.len() > 1,
        "a 45pt box must break this word: {lines:?}"
    );
    assert_eq!(lines.concat(), "aaaaaaaaaaaaaaaaaaaaaaaa");
}
