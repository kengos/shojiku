//! Unit coverage for the shaped-arrangement internals: orientation
//! segmentation and the hostile-value guards (cell advances, positioning
//! offsets) that keep a broken font's numbers out of column math.

use super::{orient_segments, sane_cell, sane_offset};
use crate::font::vertical::Orientation;
use shojiku_core::TextOrientation::{Mixed, Upright};

#[test]
fn segments_group_consecutive_same_orientation_runs() {
    let segs = orient_segments("平成26年", Mixed);
    let kinds: Vec<Orientation> = segs.iter().map(|(_, o)| *o).collect();
    assert_eq!(
        kinds,
        [
            Orientation::Upright,
            Orientation::Rotated,
            Orientation::Upright
        ]
    );
    // Byte ranges tile the text exactly.
    assert_eq!(segs[0].0.clone(), 0..6);
    assert_eq!(segs[1].0.clone(), 6..8);
    assert_eq!(segs[2].0.clone(), 8..11);
}

#[test]
fn segments_under_upright_orientation_are_one_run() {
    let segs = orient_segments("平26年", Upright);
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].0.clone(), 0.."平26年".len());
    assert!(orient_segments("", Mixed).is_empty());
}

#[test]
fn sane_cell_admits_the_cap_and_degrades_past_it() {
    // At the admitted maximum (4em), the value passes; just past it, the
    // fallback wins — the clamp's boundary is exercised on both sides.
    assert_eq!(sane_cell(40.0, 7.0, 10.0), 40.0);
    assert_eq!(sane_cell(40.1, 7.0, 10.0), 7.0);
    // Zero-advance marks are legitimate shaping output.
    assert_eq!(sane_cell(0.0, 7.0, 10.0), 0.0);
}

#[test]
fn sane_cell_degrades_hostile_values() {
    for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -1.0] {
        assert_eq!(sane_cell(bad, 7.0, 10.0), 7.0, "{bad}");
    }
}

#[test]
fn sane_offset_zeroes_hostile_values_and_keeps_real_ones() {
    assert_eq!(sane_offset(-5.0, 10.0), -5.0);
    assert_eq!(sane_offset(40.0, 10.0), 40.0);
    assert_eq!(sane_offset(-40.0, 10.0), -40.0);
    for bad in [f64::NAN, f64::INFINITY, 40.1, -40.1] {
        assert_eq!(sane_offset(bad, 10.0), 0.0, "{bad}");
    }
}
