//! Integration tests for hanging-aware wrapping (`wrap_text_chain_hung`):
//! the kinsoku×hang hand-off over real faces, and hostile comma runs.

use super::*;
use crate::font::test_support::ja_store;
use shojiku_core::HangingPunctuation::AllowEnd;

/// The fixed-pitch face: every fullwidth glyph exactly 1em, so a 10pt font
/// in a `chars × 10pt` box fits exactly `chars` per line.
fn fixed() -> &'static FontFace {
    ja_store().get("biz-ud-gothic").expect("biz-ud-gothic face")
}

fn texts(lines: &[WrappedLine]) -> Vec<String> {
    lines.iter().map(WrappedLine::text).collect()
}

#[test]
fn hanging_a_full_stop_never_exposes_a_closing_bracket() {
    // 「…。」 pattern: "ああああ。」い" in a 4-char box wraps the tail as
    // 。」い. Hanging 。 would leave 」 at a line head, so the hang pass
    // refuses and kinsoku pushes out instead (あ moves down) — exactly the
    // no-hang result. No line may ever begin with 」.
    let f = fixed();
    let lines = wrap_text_chain_hung(
        &[f],
        "ああああ。」い",
        10.0,
        40.0,
        LineBreak::Normal,
        0.0,
        AllowEnd,
    );
    assert_eq!(texts(&lines), vec!["あああ", "あ。」い"]);
    assert!(lines.iter().all(|l| !l.hung));
}

#[test]
fn hanging_a_full_stop_never_exposes_a_closing_quote() {
    // The Chinese twin of the 。」 case above: 。” is just as illegal a
    // line head, so the hang pass must refuse there too and leave the
    // pair for kinsoku push-out.
    let f = fixed();
    let lines = wrap_text_chain_hung(
        &[f],
        "ああああ。”い",
        10.0,
        40.0,
        LineBreak::Normal,
        0.0,
        AllowEnd,
    );
    assert_eq!(texts(&lines), vec!["あああ", "あ。”い"]);
    assert!(lines.iter().all(|l| !l.hung));
}

#[test]
fn a_lone_full_stop_still_hangs_when_the_rest_is_legal() {
    // Same shape without the bracket: "ああああ。い" hangs the 。 (one
    // line fewer than the kinsoku push-out would give).
    let f = fixed();
    let lines = wrap_text_chain_hung(
        &[f],
        "ああああ。い",
        10.0,
        40.0,
        LineBreak::Normal,
        0.0,
        AllowEnd,
    );
    assert_eq!(texts(&lines), vec!["ああああ。", "い"]);
    assert!(lines[0].hung);
}

#[test]
fn a_hostile_comma_run_terminates_and_hangs_at_most_one_char() {
    // 、×10000: wrapping + kinsoku + hang must terminate and lose no
    // characters. A comma-run head is not hangable, so the run is
    // kinsoku's (its push-out accumulates the tail — pre-existing comma-run
    // pathology, tracked as a fuzz candidate); the hang pass itself takes
    // exactly ONE comma onto the first line, never the run.
    let f = fixed();
    let text: String = std::iter::once('あ')
        .chain(std::iter::repeat_n('、', 10_000))
        .collect();
    let lines = wrap_text_chain_hung(&[f], &text, 10.0, 100.0, LineBreak::Normal, 0.0, AllowEnd);
    let total: usize = lines.iter().map(|l| l.text().chars().count()).sum();
    assert_eq!(total, 10_001, "no character may be lost");
    assert_eq!(lines[0].text(), "あ、", "one hung comma, not the whole run");
    assert!(lines[0].hung);
}
