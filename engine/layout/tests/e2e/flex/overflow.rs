//! The horizontal-overflow family. `horizontal_overflow` keeps the flow
//! region and the flex row pre-pass; the residual contexts report their
//! own number-only codes — `sheet_overflow` (a band / absolute-body item
//! past the SHEET edge, a `line`'s endpoints included) and
//! `child_overflow` (a column or absolute child past its parent's
//! content box).

use crate::common::*;

fn page(items: &str) -> String {
    format!(
        "page:\n  size: {{ w: 200, h: 200 }}\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n{items}"
    )
}

/// Any code in the horizontal-overflow family — the negative assertions
/// must not pass merely because the reason moved to a sibling code.
fn overflows(diags: &Diagnostics) -> bool {
    diags.iter().any(|d| {
        matches!(
            d.code.as_str(),
            "horizontal_overflow" | "sheet_overflow" | "child_overflow"
        )
    })
}

fn only(diags: &Diagnostics, code: &str) -> Diagnostic {
    let hits: Vec<_> = diags.iter().filter(|d| d.code == code).collect();
    assert_eq!(hits.len(), 1, "expected one `{code}`: {diags:?}");
    hits[0].clone()
}

#[test]
fn over_wide_fixed_row_warns() {
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "horizontal_overflow"));
}

#[test]
fn exact_fit_row_does_not_warn() {
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row, gap: 10 }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 45, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 45, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "horizontal_overflow"));
}

#[test]
fn unsized_children_shrink_and_stay_silent() {
    // Flex shares always fit by construction.
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        items:\n          - { type: text, text: あああ }\n          - { type: text, text: いいい }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "horizontal_overflow"));
}

#[test]
fn overflow_hidden_parent_clips_by_intent_and_stays_silent() {
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        style: { overflow: hidden }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "horizontal_overflow"));
}

#[test]
fn flow_item_past_the_region_edge_warns() {
    let yaml =
        page("      - { type: rect, style: { borderWidth: 1 }, box: { x: 150, w: 100, h: 10 } }\n");
    let (_, diags) = run(&yaml, json!({}));
    let hit = diags
        .iter()
        .find(|d| d.code == "horizontal_overflow")
        .expect("overflow warning");
    // 150 + 100 over a 200pt region: 50pt past the edge.
    assert!(hit.message.contains("50.0pt"), "{}", hit.message);
}

#[test]
fn filling_flow_items_never_warn() {
    let yaml = page("      - { type: text, text: あ, box: { w: 100% } }\n");
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "horizontal_overflow"));
}

// --- Residual 1: band / absolute-body items past the SHEET edge --------
//
// The bound is the paper, not the margin box: reaching INTO the page
// margins is a deliberate escape hatch, so only ink that leaves the sheet
// warns. Page 200pt wide with a 20pt margin → margin box 20..180, sheet
// edge 200.

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

// --- Residuals 2/3: per-child right-edge checks inside a container -----

#[test]
fn an_over_wide_column_child_warns_and_names_the_child() {
    let yaml = page(
        "      - type: container\n        box: { w: 100 }\n        items:\n          - { type: text, text: a }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 140, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    let hit = only(&diags, "child_overflow");
    assert_eq!(arg_num(&hit, "over"), Some(40.0));
    assert_eq!(arg_num(&hit, "avail"), Some(100.0));
    // The diagnostic addresses the CHILD, not the container it sits in.
    assert_eq!(
        hit.path.as_deref(),
        Some("sections.body.items[0].items[1]"),
        "{hit:?}"
    );
}

#[test]
fn an_over_wide_column_child_under_overflow_hidden_stays_silent() {
    let yaml = page(
        "      - type: container\n        box: { w: 100 }\n        style: { overflow: hidden }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 140, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(!overflows(&diags), "{diags:?}");
}

#[test]
fn a_column_child_that_fits_stays_silent() {
    let yaml = page(
        "      - type: container\n        box: { w: 100 }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(!overflows(&diags), "{diags:?}");
}

#[test]
fn an_over_wide_absolute_child_warns() {
    // Authored `box.x` takes the absolute path in both the flex and the
    // grid walk; the offset counts toward the overflow.
    let yaml = page(
        "      - type: container\n        box: { w: 100 }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { x: 30, y: 0, w: 100, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    let hit = only(&diags, "child_overflow");
    assert_eq!(arg_num(&hit, "over"), Some(30.0));
}

#[test]
fn the_child_warning_states_a_magnitude_not_a_side() {
    // The check runs BEFORE `column_offsets` applies the cross-axis
    // alignment, and a negative free space shifts the child LEFT: under
    // `end` the child's right edge lands exactly on the content box and
    // the whole overflow is on the left. So the message may state how
    // much, never which side.
    let yaml = page(
        "      - type: container\n        box: { w: 100, alignItems: end }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 140, h: 10 } }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    let hit = only(&diags, "child_overflow");
    assert_eq!(arg_num(&hit, "over"), Some(40.0));
    // A number-only payload cannot name a side even by accident, which is
    // the structural version of this guarantee.
    assert!(
        !hit.message.contains("right") && !hit.message.contains("left"),
        "must not name a side: {}",
        hit.message
    );
    // And the child really did move left: `end` alignment put its right
    // edge on the content-box edge, so the overflow is entirely leftward.
    let rects = rect_shapes(&doc.pages[0]);
    let over_wide = rects.iter().find(|r| r.w == 140.0).expect("the child");
    assert_eq!(over_wide.x, -40.0, "end alignment shifts it left");
}

#[test]
fn an_over_wide_row_child_is_reported_once_by_the_row_check_only() {
    // The per-child check deliberately skips ROW children: `plan_row`
    // already speaks for the whole row, and both firing would report one
    // overflow twice.
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 180, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert_eq!(
        diags
            .iter()
            .filter(|d| d.code == "horizontal_overflow")
            .count(),
        1,
        "{diags:?}"
    );
    // …and the per-child code did not also fire for it.
    assert!(
        diags.iter().all(|d| d.code != "child_overflow"),
        "{diags:?}"
    );
}
