//! Unit tests for the grid track math: sizing guards and offset
//! accumulation.

use super::*;

#[test]
fn equal_track_splits_total_minus_gaps() {
    assert_eq!(equal_track(200.0, 10.0, 2), 95.0);
    assert_eq!(equal_track(200.0, 0.0, 4), 50.0);
    // A single track takes the whole axis (no gaps apply).
    assert_eq!(equal_track(200.0, 10.0, 1), 200.0);
}

#[test]
fn equal_track_guards_zero_count_and_clamps_negative() {
    assert_eq!(equal_track(200.0, 10.0, 0), 0.0);
    // Gaps wider than the axis produce empty tracks, not negative ones.
    assert_eq!(equal_track(20.0, 30.0, 2), 0.0);
    assert_eq!(equal_track(-100.0, 0.0, 2), 0.0);
}

#[test]
fn track_offsets_accumulate_sizes_and_gap_from_start() {
    assert_eq!(
        track_offsets(&[50.0, 30.0, 20.0], 10.0, 100.0),
        vec![100.0, 160.0, 200.0]
    );
    assert_eq!(track_offsets(&[], 10.0, 5.0), Vec::<f64>::new());
}
