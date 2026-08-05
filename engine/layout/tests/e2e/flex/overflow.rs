//! The horizontal-overflow family — one number-carrying code per reason:
//! `flex_row_overflow` (fixed row children + gaps over the parent content
//! box), `flow_item_overflow` (a definite-width flow item past the
//! region's right edge), `sheet_overflow` (a band / absolute-body item
//! past the SHEET edge, a `line`'s endpoints included) and
//! `child_overflow` (a column or absolute child past its parent's content
//! box). The retired `horizontal_overflow` carried all of these in one
//! free-text arg and is emitted by nothing.

use crate::common::*;

mod sheet;

fn page(items: &str) -> String {
    format!(
        "page:\n  size: {{ w: 200, h: 200 }}\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n{items}"
    )
}

/// Any code in the horizontal-overflow family — the negative assertions
/// must not pass merely because the reason moved to a sibling code.
pub(super) fn overflows(diags: &Diagnostics) -> bool {
    diags.iter().any(|d| {
        matches!(
            d.code.as_str(),
            "flex_row_overflow" | "flow_item_overflow" | "sheet_overflow" | "child_overflow"
        )
    })
}

pub(super) fn only(diags: &Diagnostics, code: &str) -> Diagnostic {
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
    let hit = only(&diags, "flex_row_overflow");
    // 80 + 80 fixed children in a 100pt content box.
    assert_eq!(arg_num(&hit, "needed"), Some(160.0));
    assert_eq!(arg_num(&hit, "avail"), Some(100.0));
    assert!(args_all_numeric(&hit), "{hit:?}");
}

#[test]
fn exact_fit_row_does_not_warn() {
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row, gap: 10 }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 45, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 45, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "flex_row_overflow"));
}

#[test]
fn unsized_children_shrink_and_stay_silent() {
    // Flex shares always fit by construction.
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        items:\n          - { type: text, text: あああ }\n          - { type: text, text: いいい }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "flex_row_overflow"));
}

#[test]
fn overflow_hidden_parent_clips_by_intent_and_stays_silent() {
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        style: { overflow: hidden }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "flex_row_overflow"));
}

#[test]
fn flow_item_past_the_region_edge_warns() {
    let yaml =
        page("      - { type: rect, style: { borderWidth: 1 }, box: { x: 150, w: 100, h: 10 } }\n");
    let (_, diags) = run(&yaml, json!({}));
    let hit = only(&diags, "flow_item_overflow");
    // 150 + 100 over a 200pt region: 50pt past the edge.
    assert_eq!(arg_num(&hit, "over"), Some(50.0));
    assert_eq!(arg_num(&hit, "avail"), Some(200.0));
    assert!(args_all_numeric(&hit), "{hit:?}");
}

#[test]
fn filling_flow_items_never_warn() {
    let yaml = page("      - { type: text, text: あ, box: { w: 100% } }\n");
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "flow_item_overflow"));
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
    // already speaks for the whole row (`flex_row_overflow`), and both
    // firing would report one overflow twice.
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 180, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert_eq!(
        diags
            .iter()
            .filter(|d| d.code == "flex_row_overflow")
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

#[test]
fn the_retired_free_text_code_is_emitted_by_nothing() {
    // `horizontal_overflow` kept its registry entry (codes and arg keys
    // are append-only, and a consumer may still hold a catalog key) but
    // every reason it covered now has its own number-carrying code. The
    // shapes that used to raise it must raise a successor instead — one
    // per reason, so a mis-routed emit shows up as a MISSING successor
    // rather than as a still-passing generic assertion.
    let row = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n",
    );
    let flow =
        page("      - { type: rect, style: { borderWidth: 1 }, box: { x: 150, w: 100, h: 10 } }\n");
    for (yaml, successor) in [(row, "flex_row_overflow"), (flow, "flow_item_overflow")] {
        let (_, diags) = run(&yaml, json!({}));
        assert!(
            diags.iter().all(|d| d.code != "horizontal_overflow"),
            "retired code was emitted: {diags:?}"
        );
        assert!(
            diags.iter().any(|d| d.code == successor),
            "expected `{successor}`: {diags:?}"
        );
    }
}
