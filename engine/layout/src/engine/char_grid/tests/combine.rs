//! 縦中横 cell grouping: digit runs share one cell, longer runs stay
//! wholly uncombined, and groups wrap like ordinary cells.

use super::super::cells::assign_cells;
use super::plain;
use shojiku_core::KinsokuMode;

/// `(line, pos, text)` of every stored cell.
fn cells_of(text: &str, cpl: usize, combine: Option<u8>) -> Vec<(usize, usize, String)> {
    let (cells, _) = assign_cells(&plain(text), cpl, 99, KinsokuMode::School, 100, combine);
    cells.iter().map(|c| (c.line, c.pos, c.text())).collect()
}

#[test]
fn a_digit_pair_shares_one_cell() {
    let cells = cells_of("平成8年12月", 8, Some(2));
    assert_eq!(
        cells,
        vec![
            (0, 0, "平".into()),
            (0, 1, "成".into()),
            (0, 2, "8".into()),
            (0, 3, "年".into()),
            (0, 4, "12".into()),
            (0, 5, "月".into()),
        ]
    );
}

#[test]
fn a_run_longer_than_the_knob_stays_wholly_uncombined() {
    // CSS `digits N`: no suffix of an over-long run re-combines.
    let cells = cells_of("123", 8, Some(2));
    assert_eq!(
        cells,
        vec![(0, 0, "1".into()), (0, 1, "2".into()), (0, 2, "3".into()),]
    );
}

#[test]
fn a_group_at_the_knob_maximum_combines() {
    // The clamp's admitted maximum (4 digits) still forms one cell.
    let cells = cells_of("2026", 8, Some(4));
    assert_eq!(cells, vec![(0, 0, "2026".into())]);
}

#[test]
fn a_group_wraps_to_the_next_line_when_the_line_is_full() {
    let cells = cells_of("あい12", 2, Some(2));
    assert_eq!(
        cells,
        vec![
            (0, 0, "あ".into()),
            (0, 1, "い".into()),
            (1, 0, "12".into()),
        ]
    );
}

#[test]
fn without_the_knob_digits_fill_one_cell_each() {
    let cells = cells_of("12", 8, None);
    assert_eq!(cells, vec![(0, 0, "1".into()), (0, 1, "2".into())]);
}

#[test]
fn repeated_digit_runs_group_independently() {
    // A repeat-run of groups: every pair costs exactly one cell.
    let cells = cells_of("12341234", 8, Some(2)); // two 4-runs > 2 → uncombined
    assert_eq!(cells.len(), 8);
    let cells = cells_of("12あ34あ56", 8, Some(2));
    assert_eq!(cells.len(), 5);
    assert_eq!(cells[0].2, "12");
    assert_eq!(cells[2].2, "34");
    assert_eq!(cells[4].2, "56");
}

#[test]
fn combined_digits_accepts_only_short_digit_runs() {
    use super::super::cells::CombinedDigits;
    assert!(CombinedDigits::new(&['1']).is_none());
    assert!(CombinedDigits::new(&['1', '2', '3', '4', '5']).is_none());
    assert!(CombinedDigits::new(&['1', 'a']).is_none());
    let d = CombinedDigits::new(&['1', '2']).expect("a pair combines");
    assert_eq!(d.text(), "12");
}
