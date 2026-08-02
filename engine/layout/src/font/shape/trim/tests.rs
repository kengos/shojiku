//! Behavior tests for 約物半角 trimming, exercised through the public
//! `shape_run`/`run_width` so the private classification and re-layout are
//! covered end to end. The **fixed-pitch** `biz-ud-gothic` face is used so
//! every fullwidth glyph is exactly 1em and widths are exact: an untrimmed
//! fullwidth glyph advances `size`, a trimmed one `size / 2`.

use crate::font::test_support::ja_store;
use crate::font::{run_width, shape_run, RunOptions};
use shojiku_core::TextSpacingTrim;

/// The fixed-pitch face (uniform 1em fullwidth advances).
fn fixed() -> &'static crate::font::FontFace {
    ja_store().get("biz-ud-gothic").expect("biz-ud-gothic face")
}

fn opts(trim: TextSpacingTrim, line_start: bool) -> RunOptions {
    RunOptions {
        letter_spacing: 0.0,
        trim,
        line_start,
        combine: None,
    }
}

#[test]
fn space_all_leaves_every_advance_full() {
    let f = fixed();
    // Two fullwidth punctuation, no trimming: 2em.
    assert!(
        (run_width(&[f], "」「", 10.0, opts(TextSpacingTrim::SpaceAll, false)) - 20.0).abs() < 1e-9
    );
}

#[test]
fn normal_trims_an_adjacent_punctuation_pair_to_half_each() {
    let f = fixed();
    // 」(close, trailing space dropped) + 「(open, leading space dropped) =
    // 0.5em + 0.5em = 1em.
    let glyphs = shape_run(&[f], "」「", 10.0, opts(TextSpacingTrim::Normal, false));
    assert!((glyphs[0].advance - 5.0).abs() < 1e-9, "close half");
    assert!((glyphs[1].advance - 5.0).abs() < 1e-9, "open half");
    // The opening bracket slid left to hug the closing one, and the pen was
    // re-laid from the trimmed advances.
    assert!((glyphs[1].x - 5.0).abs() < 1e-9, "pen re-laid");
    assert!((glyphs[1].x_offset + 5.0).abs() < 1e-9, "open slid left");
    assert!(
        (run_width(&[f], "」「", 10.0, opts(TextSpacingTrim::Normal, false)) - 10.0).abs() < 1e-9
    );
}

#[test]
fn normal_leaves_a_line_final_closing_untrimmed() {
    let f = fixed();
    // 、(close, next 」 is punct → trimmed) + 」(close, nothing follows →
    // untouched) = 0.5em + 1em = 1.5em.
    assert!(
        (run_width(&[f], "、」", 10.0, opts(TextSpacingTrim::Normal, false)) - 15.0).abs() < 1e-9
    );
}

#[test]
fn normal_leaves_punctuation_next_to_an_ideograph() {
    let f = fixed();
    // 、 is closing but the next glyph あ is not punctuation, so nothing is
    // trimmed: 1em + 1em = 2em.
    assert!(
        (run_width(&[f], "、あ", 10.0, opts(TextSpacingTrim::Normal, false)) - 20.0).abs() < 1e-9
    );
}

#[test]
fn normal_leaves_an_interior_opening_bracket_without_a_punct_before() {
    let f = fixed();
    // あ「: the opening bracket's predecessor あ is not punctuation, so the
    // bracket keeps its leading space: 1em + 1em = 2em.
    assert!(
        (run_width(&[f], "あ「", 10.0, opts(TextSpacingTrim::Normal, false)) - 20.0).abs() < 1e-9
    );
}

#[test]
fn trim_start_trims_a_line_head_opening_bracket() {
    let f = fixed();
    // 「 at the line head under trim_start loses its leading space: 0.5em +
    // 1em (あ) = 1.5em.
    let g = shape_run(&[f], "「あ", 10.0, opts(TextSpacingTrim::TrimStart, true));
    assert!((g[0].advance - 5.0).abs() < 1e-9);
    assert!(
        (g[0].x_offset + 5.0).abs() < 1e-9,
        "head bracket slid to margin"
    );
    assert!(
        (run_width(&[f], "「あ", 10.0, opts(TextSpacingTrim::TrimStart, true)) - 15.0).abs() < 1e-9
    );
}

#[test]
fn trim_start_off_a_line_start_leaves_the_head_bracket() {
    let f = fixed();
    // Same text, but this run does not begin a line: no line-head trim.
    assert!(
        (run_width(&[f], "「あ", 10.0, opts(TextSpacingTrim::TrimStart, false)) - 20.0).abs()
            < 1e-9
    );
}

#[test]
fn run_width_stays_the_sum_of_advances_under_trim() {
    let f = fixed();
    let o = opts(TextSpacingTrim::Normal, false);
    let sum: f64 = shape_run(&[f], "」「。あ", 10.0, o)
        .iter()
        .map(|g| g.advance)
        .sum();
    assert!((run_width(&[f], "」「。あ", 10.0, o) - sum).abs() < 1e-9);
}

#[test]
fn empty_run_does_not_panic_under_trim() {
    let f = fixed();
    assert!(shape_run(&[f], "", 10.0, opts(TextSpacingTrim::Normal, false)).is_empty());
}
