//! Pagination guards: the page cap, policy-handled overflows staying
//! whole, and the not-even-one-column hostile case keeping the warning.

use super::tmpl;
use crate::common::*;

#[test]
fn the_page_cap_stops_the_fragment_loop() {
    // 3 cells per column, cap 2 per 25pt page → 750 columns want 375
    // pages... times 2 keeps it beyond the 500-page cap: the loop stops
    // there with `page_overflow`, never spinning.
    let text = "あいうえおか".repeat(510);
    let (doc, diags) = run(&tmpl(&text, "w: 15, h: 30", "", ""), json!({}));
    assert_eq!(doc.pages.len(), 500);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
}

#[test]
fn a_policy_handled_overflow_places_whole() {
    // `ellipsis` resolves the width overflow in the builder, so the flow
    // places one page — pagination only takes the visible-behaving case.
    let (doc, diags) = run(
        &tmpl(
            "あいうえおかきくけこさしすせそ",
            "w: 25, h: 30",
            "",
            ", textOverflow: ellipsis",
        ),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1);
    assert!(!diags.iter().any(|d| d.code == "horizontal_overflow"));
}

#[test]
fn a_column_too_wide_for_the_box_warns_instead_of_paginating() {
    // A box narrower than ONE column (10pt col in a 5pt box): pagination
    // cannot take over (no page holds a column), so the overflow warns
    // and the block places whole on one page.
    let (doc, diags) = run(&tmpl("あいう", "w: 5, h: 100", "", ""), json!({}));
    assert_eq!(doc.pages.len(), 1);
    assert!(diags.iter().any(|d| d.code == "horizontal_overflow"));
}

#[test]
fn a_fitting_vertical_block_places_without_fragments() {
    let out = run_full(&tmpl("あいうえお", "w: 40, h: 30", "", ""), json!({}));
    assert_eq!(out.boxes.pages.len(), 1);
    assert_eq!(out.boxes.pages[0].len(), 1, "one placement, no fragments");
}
