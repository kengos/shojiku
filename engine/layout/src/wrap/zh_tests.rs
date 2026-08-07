//! Wrapper-level tests for the Chinese kinsoku characters: the quote and
//! white-bracket prohibitions acting through `apply_kinsoku`, plus the
//! adversarial cases (nothing is lost, nothing loops) that the added
//! classes have to keep satisfying.

use super::*;
use crate::font::test_support::ja_store;

/// The fixed-pitch face: every fullwidth glyph is exactly 1em, so a 10pt
/// font in a `chars × 10pt` box fits exactly `chars` per line.
fn fixed() -> &'static FontFace {
    ja_store().get("biz-ud-gothic").expect("biz-ud-gothic face")
}

#[test]
fn anywhere_keeps_every_added_character_and_drops_kinsoku() {
    // `anywhere` skips the kinsoku pass entirely, so the new classes must
    // not hold anything back — and, whatever it breaks, no character may
    // be lost. One-char-wide box: the most aggressive breaking there is.
    let text = "〖〗〘〙〚〛〝〞〟‘’“”";
    let lines = wrap_text(fixed(), text, 10.0, 10.0, LineBreak::Anywhere, 0.0);
    assert_eq!(lines.concat(), text, "no character may be dropped");
    assert!(lines.len() > 1, "a 1-char box must break this text");
    // Not compared against `normal` here: at one character per line the
    // two agree anyway, because push-out may never empty the line it
    // pulls from. The comparison below uses a box that can actually move.
}

#[test]
fn anywhere_leaves_a_quote_where_normal_pushes_it_out() {
    // The discriminating case: in a 2-character box `ああ”あ` wraps to
    // `ああ` / `”あ`, and only `normal` pulls あ down to rescue the head.
    let held = wrap_text(fixed(), "ああ”あ", 10.0, 25.0, LineBreak::Normal, 0.0);
    let free = wrap_text(fixed(), "ああ”あ", 10.0, 25.0, LineBreak::Anywhere, 0.0);
    assert_eq!(held, vec!["あ", "あ”あ"]);
    assert_eq!(free, vec!["ああ", "”あ"]);
}

#[test]
fn a_hard_broken_latin_token_keeps_a_quote_with_its_word() {
    // The one Latin path where a quote CAN reach a line edge: a token
    // wider than the whole line hard-breaks per character, so `’` becomes
    // a break point like any other. Push-out then keeps it attached to
    // the letter before it — no line may begin with it.
    let store = ja_store();
    let face = store.face(None);
    let text = "aaaa’aaaa";
    let w = face.text_width("aaa", 10.0, 0.0);
    let lines = wrap_text(face, text, 10.0, w, LineBreak::Normal, 0.0);
    assert_eq!(lines.concat(), text, "no character may be dropped");
    assert!(
        !lines.iter().any(|l| l.starts_with('’')),
        "no line may begin with ’: {lines:?}"
    );
}

#[test]
fn push_out_does_not_re_expose_a_trailing_space() {
    // Mixed Latin/CJK is where this bites: `“` is preceded by a space in
    // real text, so pushing it down leaves `He said ` behind. The line is
    // measured over its whole text, so a surviving space would shift a
    // centred or end-aligned line by one space width.
    let store = ja_store();
    let face = store.face(None);
    let w = face.text_width("He said “", 10.0, 0.0);
    let lines = wrap_text(face, "He said “你好", 10.0, w, LineBreak::Normal, 0.0);
    assert!(
        !lines.iter().any(|l| l.ends_with(' ')),
        "no line may keep a trailing space: {lines:?}"
    );
    assert!(
        lines.iter().any(|l| l.starts_with('“')),
        "the quote should have been pushed down: {lines:?}"
    );
}

#[test]
fn a_line_of_only_a_prohibited_quote_is_not_emptied() {
    // The `len() > 1` guard: pulling the previous line's last character
    // down must never empty it, so a pathological one-character line just
    // keeps its violation instead of losing text or looping.
    let text = "あ”あ";
    let lines = wrap_text(fixed(), text, 10.0, 10.0, LineBreak::Normal, 0.0);
    assert_eq!(lines.concat(), text, "no character may be dropped");
    assert!(
        lines.iter().all(|l| !l.is_empty()),
        "no line may be emptied: {lines:?}"
    );
}
