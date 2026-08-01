//! Unit tests for the pure imposition page math: row fitting under the
//! flow cursor and the element -> page/slot mapping.

use super::*;

/// A grid whose rows are 100pt tall with a 10pt gap: 3 rows need
/// 100 + 10 + 100 + 10 + 100 = 320pt, and the trailing gap is not needed.
fn pages(first_rows: usize, first_top: f64, direction: GridDirection) -> GridPages {
    GridPages {
        cols: 2,
        rows: 3,
        first_rows,
        first_top,
        region_top: 50.0,
        direction,
    }
}

#[test]
fn rows_fit_exactly_at_the_pitch_boundary() {
    // Two rows need 210pt (100 + 10 + 100); one pt less fits only one.
    assert_eq!(first_page_rows(210.0, 100.0, 10.0, 3), 2);
    assert_eq!(first_page_rows(209.0, 100.0, 10.0, 3), 1);
    assert_eq!(first_page_rows(100.0, 100.0, 10.0, 3), 1);
}

#[test]
fn a_cursor_leaving_less_than_one_row_fits_nothing() {
    assert_eq!(first_page_rows(99.0, 100.0, 10.0, 3), 0);
    assert_eq!(first_page_rows(0.0, 100.0, 10.0, 3), 0);
}

#[test]
fn fitting_rows_clamp_to_the_authored_row_count() {
    // The whole region would fit ten rows; the grid only has three.
    assert_eq!(first_page_rows(2000.0, 100.0, 10.0, 3), 3);
}

#[test]
fn a_gapless_grid_fits_whole_rows() {
    assert_eq!(first_page_rows(250.0, 100.0, 0.0, 5), 2);
}

#[test]
fn hostile_available_height_fits_nothing() {
    assert_eq!(first_page_rows(f64::NAN, 100.0, 10.0, 3), 0);
    assert_eq!(first_page_rows(f64::NEG_INFINITY, 100.0, 10.0, 3), 0);
    assert_eq!(first_page_rows(-500.0, 100.0, 10.0, 3), 0);
}

#[test]
fn a_degenerate_pitch_fits_every_row() {
    // Zero-height slots (a region shorter than its gaps) and a negative gap
    // that cancels the slot both mean "everything fits", like the
    // full-region grid does with the same numbers.
    assert_eq!(first_page_rows(500.0, 0.0, 0.0, 3), 3);
    assert_eq!(first_page_rows(500.0, 100.0, -100.0, 3), 3);
    assert_eq!(first_page_rows(f64::NAN, 0.0, 0.0, 3), 3);
}

#[test]
fn an_infinite_pitch_fits_nothing() {
    assert_eq!(first_page_rows(500.0, f64::INFINITY, 0.0, 3), 0);
}

#[test]
fn elements_fill_the_short_first_page_before_paginating() {
    // First page: 2 cols x 1 row = 2 cells at the cursor; later pages:
    // 2 x 3 = 6 cells at the region top.
    let plan = pages(1, 400.0, GridDirection::Row);

    let first = plan.locate(0);
    assert_eq!((first.page, first.col, first.row), (0, 0, 0));
    assert_eq!(first.top, 400.0);
    let last_of_first = plan.locate(1);
    assert_eq!(
        (last_of_first.page, last_of_first.col, last_of_first.row),
        (0, 1, 0)
    );

    // Element 2 is the first one past the short page.
    let second_page = plan.locate(2);
    assert_eq!(
        (second_page.page, second_page.col, second_page.row),
        (1, 0, 0)
    );
    assert_eq!(second_page.top, 50.0);
    // ...and element 7 is the last of that full page (2 + 6 - 1).
    let full_page_end = plan.locate(7);
    assert_eq!(
        (full_page_end.page, full_page_end.col, full_page_end.row),
        (1, 1, 2)
    );
    assert_eq!(plan.locate(8).page, 2);
}

#[test]
fn a_full_first_page_maps_like_an_unbroken_grid() {
    let plan = pages(3, 50.0, GridDirection::Row);
    assert_eq!(plan.locate(5).page, 0);
    assert_eq!(plan.locate(6).page, 1);
    assert_eq!(plan.locate(6).top, 50.0);
}

#[test]
fn column_fill_order_wraps_within_each_pages_own_row_count() {
    // The short first page has 2 rows, so column-major wraps after 2...
    let plan = pages(2, 400.0, GridDirection::Column);
    assert_eq!((plan.locate(0).col, plan.locate(0).row), (0, 0));
    assert_eq!((plan.locate(1).col, plan.locate(1).row), (0, 1));
    assert_eq!((plan.locate(2).col, plan.locate(2).row), (1, 0));
    assert_eq!((plan.locate(3).col, plan.locate(3).row), (1, 1));
    // ...while the next (full) page wraps after 3.
    let full = plan.locate(4 + 2);
    assert_eq!((full.page, full.col, full.row), (1, 0, 2));
    let wrapped = plan.locate(4 + 3);
    assert_eq!((wrapped.page, wrapped.col, wrapped.row), (1, 1, 0));
}
