//! Unit tests for vertical (縦書き) column wrapping: the shared greedy /
//! kinsoku / hanging machinery driven by down-advances against a column
//! height. The fixed-pitch `biz-ud-gothic` face gives every upright cell a
//! constant vertical advance, so column char counts are exact.

use super::*;
use crate::font::test_support::ja_store;
use shojiku_core::TextOrientation::Mixed;
use shojiku_core::{HangingPunctuation, LineBreak};

/// Column texts, top-to-bottom, for a vertical wrap.
fn columns(text: &str, max_down: f64, lb: LineBreak) -> Vec<String> {
    let store = ja_store();
    let face = store.get("biz-ud-gothic").unwrap();
    wrap_vertical(
        &[face],
        text,
        10.0,
        max_down,
        lb,
        0.0,
        Mixed,
        HangingPunctuation::None,
        None,
    )
    .iter()
    .map(WrappedLine::text)
    .collect()
}

/// The constant upright cell advance for the fixed-pitch face at 10pt.
fn cell() -> f64 {
    ja_store()
        .get("biz-ud-gothic")
        .unwrap()
        .vertical_advance(10.0)
}

#[test]
fn columns_break_against_the_height() {
    // Room for exactly three cells per column.
    let max_down = 3.0 * cell() + 0.4;
    let cols = columns("あいうえおか", max_down, LineBreak::Normal);
    assert_eq!(cols, vec!["あいう".to_string(), "えおか".to_string()]);
}

#[test]
fn single_column_when_it_all_fits() {
    let cols = columns("あいう", 100.0, LineBreak::Normal);
    assert_eq!(cols, vec!["あいう".to_string()]);
}

#[test]
fn kinsoku_keeps_a_comma_off_a_column_top() {
    // Without kinsoku "あ、" then "い…": three cells fit, so a naive break
    // after 3 would put 「、」-family char at a column head. The comma is
    // pulled back so it never starts a column.
    let max_down = 2.0 * cell() + 0.4;
    let cols = columns("あ、いう", max_down, LineBreak::Normal);
    // No column may begin with 、.
    assert!(
        cols.iter().all(|c| !c.starts_with('、')),
        "got columns: {cols:?}"
    );
}

#[test]
fn over_tall_single_char_still_emitted() {
    // A column height below one cell still yields the char (never lost).
    let cols = columns("あ", 1.0, LineBreak::Normal);
    assert_eq!(cols, vec!["あ".to_string()]);
}

#[test]
fn empty_text_yields_one_empty_column() {
    let cols = columns("", 100.0, LineBreak::Normal);
    assert_eq!(cols, vec![String::new()]);
}

#[test]
fn closing_quote_pattern_keeps_bracket_and_stop_together() {
    // The 「…。」 desk trace: a closing 」 must not start a column, and 。
    // must not either — both are pulled back with the preceding text.
    let max_down = 3.0 * cell() + 0.4;
    let cols = columns("あい「う。」", max_down, LineBreak::Normal);
    assert!(
        cols.iter()
            .all(|c| !c.starts_with('」') && !c.starts_with('。')),
        "got columns: {cols:?}"
    );
}

#[test]
fn comma_run_terminates_and_loses_no_text() {
    // The 、×N degenerate desk trace: a pure comma run cannot legally start
    // a column, so kinsoku accumulates them — it must still terminate and
    // preserve every character.
    let max_down = 2.0 * cell() + 0.4;
    let cols = columns("あ、、、、、", max_down, LineBreak::Normal);
    let joined: String = cols.concat();
    assert_eq!(joined, "あ、、、、、");
}
