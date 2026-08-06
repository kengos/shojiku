//! `lineBreak: strict | loose` end to end (`src/style/enums.rs` →
//! `src/wrap/kinsoku.rs`): the wire keyword reaches the wrapper and
//! changes which characters are held off a line start, while the default
//! `normal` follows CSS (small kana may start a line).

use crate::common::*;

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
