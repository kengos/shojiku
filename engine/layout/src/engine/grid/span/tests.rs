//! Occupancy/span placement: fill order, span collisions, growth.

use super::*;
use shojiku_core::FlexDirection;

fn place(occ: &mut Occupancy, cs: usize, rs: usize) -> (usize, usize) {
    let cell = occ.place(cs, rs, FlexDirection::Row, 1);
    (cell.col, cell.row)
}

#[test]
fn row_fill_without_spans_matches_index_order() {
    let mut occ = Occupancy::new(3);
    assert_eq!(place(&mut occ, 1, 1), (0, 0));
    assert_eq!(place(&mut occ, 1, 1), (1, 0));
    assert_eq!(place(&mut occ, 1, 1), (2, 0));
    assert_eq!(place(&mut occ, 1, 1), (0, 1));
}

#[test]
fn column_span_wraps_when_the_row_cannot_fit_it() {
    let mut occ = Occupancy::new(3);
    assert_eq!(place(&mut occ, 1, 1), (0, 0));
    // A 3-wide child cannot start at column 1: wraps to the next row.
    assert_eq!(place(&mut occ, 3, 1), (0, 1));
    // The two cells left free on row 0 are reused afterwards.
    assert_eq!(place(&mut occ, 1, 1), (1, 0));
    assert_eq!(place(&mut occ, 1, 1), (2, 0));
}

#[test]
fn row_span_blocks_the_cells_beneath() {
    let mut occ = Occupancy::new(2);
    assert_eq!(place(&mut occ, 1, 2), (0, 0)); // occupies (0,0) and (0,1)
    assert_eq!(place(&mut occ, 1, 1), (1, 0));
    assert_eq!(place(&mut occ, 1, 1), (1, 1));
    assert_eq!(place(&mut occ, 1, 1), (0, 2));
}

#[test]
fn column_fill_places_down_then_right_and_grows_when_full() {
    let mut occ = Occupancy::new(2);
    let c = |o: &mut Occupancy, cs, rs| {
        let cell = o.place(cs, rs, FlexDirection::Column, 2);
        (cell.col, cell.row)
    };
    assert_eq!(c(&mut occ, 1, 1), (0, 0));
    assert_eq!(c(&mut occ, 1, 1), (0, 1));
    assert_eq!(c(&mut occ, 1, 1), (1, 0));
    assert_eq!(c(&mut occ, 1, 1), (1, 1));
    // The bounded 2×2 grid is full: an implicit row is added.
    assert_eq!(c(&mut occ, 1, 1), (0, 2));
}

#[test]
fn column_fill_respects_row_spans() {
    let mut occ = Occupancy::new(2);
    let c = |o: &mut Occupancy, cs, rs| {
        let cell = o.place(cs, rs, FlexDirection::Column, 3);
        (cell.col, cell.row)
    };
    assert_eq!(c(&mut occ, 1, 2), (0, 0));
    assert_eq!(c(&mut occ, 1, 2), (1, 0)); // rows 1..3 of col 0 can't fit contiguously from 2
    assert_eq!(c(&mut occ, 1, 1), (0, 2));
}
