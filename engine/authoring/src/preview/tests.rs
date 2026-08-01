//! Unit tests for preview rasterization: one PNG per page, and render-error
//! propagation.

use super::*;
use crate::test_support::{ja_fonts, ok_prepared};

#[test]
fn preview_pages_returns_one_png_per_page() {
    let prepared = ok_prepared();
    let pages = preview_pages(&prepared, ja_fonts(), 2.0).unwrap();
    assert_eq!(pages.len(), prepared.document.pages.len());
    assert!(pages[0].starts_with(b"\x89PNG"));
}

#[test]
fn preview_pages_propagates_render_errors() {
    let prepared = ok_prepared();
    // scale 0 makes a zero-pixel canvas → a render error.
    assert!(preview_pages(&prepared, ja_fonts(), 0.0).is_err());
}

#[test]
fn preview_raw_returns_one_rgba_page_per_page() {
    let prepared = ok_prepared();
    let pages = preview_raw(&prepared, ja_fonts(), 2.0).unwrap();
    assert_eq!(pages.len(), prepared.document.pages.len());
    let page = &pages[0];
    assert_eq!(
        page.rgba.len(),
        page.width_px as usize * page.height_px as usize * 4
    );
}

#[test]
fn preview_raw_propagates_render_errors() {
    let prepared = ok_prepared();
    assert!(preview_raw(&prepared, ja_fonts(), 0.0).is_err());
}

#[test]
fn preview_page_matches_the_all_pages_entry() {
    let prepared = ok_prepared();
    let all = preview_pages(&prepared, ja_fonts(), 2.0).unwrap();
    let one = preview_page(&prepared, ja_fonts(), 2.0, 0).unwrap();
    assert_eq!(one, all[0]);

    let all_raw = preview_raw(&prepared, ja_fonts(), 2.0).unwrap();
    let one_raw = preview_page_raw(&prepared, ja_fonts(), 2.0, 0).unwrap();
    assert_eq!(one_raw.rgba, all_raw[0].rgba);
}

#[test]
fn preview_page_rejects_an_out_of_range_index() {
    // ok_prepared is single-page; index 1 is past the end.
    let prepared = ok_prepared();
    assert!(matches!(
        preview_page(&prepared, ja_fonts(), 2.0, 1),
        Err(RenderPngError::PageOutOfRange { page: 1, total: 1 })
    ));
    assert!(matches!(
        preview_page_raw(&prepared, ja_fonts(), 2.0, 1),
        Err(RenderPngError::PageOutOfRange { page: 1, total: 1 })
    ));
}

#[test]
fn preview_page_propagates_render_errors() {
    // A bad scale is caught by the shared guard before the bounds check.
    let prepared = ok_prepared();
    assert!(preview_page(&prepared, ja_fonts(), 0.0, 0).is_err());
    assert!(preview_page_raw(&prepared, ja_fonts(), 0.0, 0).is_err());
}
