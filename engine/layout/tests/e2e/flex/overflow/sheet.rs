//! `sheet_overflow`: the band / absolute-body bound is the PAPER, not the
//! margin box. Reaching INTO the page margins is a deliberate escape
//! hatch (a full-bleed background, a rule wider than the text column), so
//! only ink that leaves the sheet warns. A `line` is covered too — it has
//! no border box, so the check falls back to its endpoint bounding box.
//!
//! Page 200pt wide with a 20pt margin → margin box 20..180, sheet edge 200.

use super::{only, overflows};
use crate::common::*;

fn absolute_body(item: &str) -> Diagnostics {
    run(
        &format!(
            "page: {{ size: {{ w: 200, h: 200 }}, margin: 20 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n      - {item}\n"
        ),
        json!({}),
    )
    .1
}

#[test]
fn an_absolute_item_past_the_sheet_edge_warns() {
    // x 100 (margin-box relative → sheet x 120) + w 100 = 220: 20pt off.
    let diags = absolute_body(
        "{ type: rect, style: { borderWidth: 1 }, box: { x: 100, y: 0, w: 100, h: 10 } }",
    );
    let hit = only(&diags, "sheet_overflow");
    // The payload is a NUMBER, not a pre-rendered English sentence: that
    // is what lets a translating consumer write its own wording.
    assert_eq!(arg_num(&hit, "over"), Some(20.0));
    assert!(args_all_numeric(&hit), "{hit:?}");
}

#[test]
fn an_item_reaching_only_into_the_page_margin_stays_silent() {
    // The escape hatch: x 100 + w 80 = sheet x 200 exactly — it eats the
    // whole right margin and is still ON the paper. A rule written
    // against the MARGIN BOX would warn here and train authors to ignore
    // the code.
    let diags = absolute_body(
        "{ type: rect, style: { borderWidth: 1 }, box: { x: 100, y: 0, w: 80, h: 10 } }",
    );
    assert!(!overflows(&diags), "{diags:?}");
}

#[test]
fn a_band_item_past_the_sheet_edge_warns() {
    let (_, diags) = run(
        "page: { size: { w: 200, h: 200 }, margin: 20 }\n\
         sections:\n  header:\n    items:\n      \
         - { type: rect, style: { borderWidth: 1 }, box: { x: 150, y: 0, w: 100, h: 10 } }\n  \
         body:\n    type: flow\n    items: []\n",
        json!({}),
    );
    assert_eq!(arg_num(&only(&diags, "sheet_overflow"), "over"), Some(70.0));
}

#[test]
fn a_filling_absolute_item_never_warns_about_the_sheet() {
    // `rb.w` unset — the item is bounded by its basis and cannot overflow.
    let diags = absolute_body("{ type: text, text: あ, box: { x: 0, y: 0 } }");
    assert!(!overflows(&diags), "{diags:?}");
}

#[test]
fn a_line_whose_endpoints_leave_the_sheet_warns() {
    // A `line` has no border box, so the border-box comparison every other
    // item uses reads `rb: None`. Its placed box IS the endpoint bounding
    // box, which is the same rectangle the stroke inks — so that is what
    // the sheet check falls back to. Margin box 20..180, sheet edge 200;
    // an endpoint at 220 (margin-box relative) lands at 240: 40pt off.
    let diags = absolute_body("{ type: line, from: { x: 0, y: 10 }, to: { x: 220, y: 10 } }");
    assert_eq!(arg_num(&only(&diags, "sheet_overflow"), "over"), Some(40.0));
}

#[test]
fn a_line_reaching_only_into_the_page_margin_stays_silent() {
    // The same escape hatch a boxed item gets: a rule drawn out to the
    // paper's edge is a normal thing to want.
    let diags = absolute_body("{ type: line, from: { x: 0, y: 10 }, to: { x: 180, y: 10 } }");
    assert!(!overflows(&diags), "{diags:?}");
}

#[test]
fn a_percent_line_endpoint_can_never_leave_the_sheet() {
    // `100%` is the margin box, which is strictly inside the paper — the
    // new authoring form cannot produce the defect the check looks for.
    let diags = absolute_body("{ type: line, from: { x: 0, y: 10 }, to: { x: \"100%\", y: 10 } }");
    assert!(!overflows(&diags), "{diags:?}");
}
