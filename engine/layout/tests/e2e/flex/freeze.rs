//! The CSS freeze loop reached from a TEMPLATE: `minWidth`/`maxWidth` on
//! an unsized flex share, the surplus a frozen child hands back to its
//! unfrozen siblings, and the hostile bounds an untrusted template can
//! put on either end.
//!
//! `layout-box` unit-tests `resolve_flex_lengths` directly and pins the
//! raw shares. These are the other half of the claim: that an authored
//! template actually reaches it, with the margins and the clamp order
//! the planner applies on the way.

use crate::common::*;
use crate::flex::container_body;

/// Three unsized bordered children in a 300pt row, each at `flexGrow: 1`
/// and `flexBasis: 0` so the arithmetic is the loop's alone — no content
/// widths in the numbers. `bounds` decorates the FIRST child.
fn shares(bounds: &str) -> Vec<f64> {
    let child = |extra: &str| {
        format!(
            "- type: container\n  box: {{ h: 20, flexBasis: 0, flexGrow: 1{extra} }}\n  style: {{ borderWidth: 1 }}\n  items:\n    - type: text\n      text: x"
        )
    };
    let children = format!("{}\n{}\n{}", child(bounds), child(""), child(""));
    let yaml = container_body("{ x: 0, y: 0, w: 300, h: 40, direction: row }", &children);
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    rect_shapes(&doc.pages[0]).iter().map(|r| r.w).collect()
}

#[test]
fn an_even_split_is_the_unclamped_baseline() {
    // The control every case below is read against: with no bounds the
    // three shares are exactly a third each. Without this number the
    // clamped cases cannot be told from arithmetic that merely looks
    // plausible.
    assert_eq!(shares(""), vec![100.0, 100.0, 100.0]);
}

#[test]
fn a_max_width_freezes_a_share_and_the_surplus_goes_to_the_siblings() {
    // A `maxWidth` bound. The child is capped well under its 100pt share;
    // what it gives up must land on the UNFROZEN siblings, not be dropped
    // on the floor. That redistribution is the whole difference between a
    // real freeze loop and a single clamp-and-stop — a clamp-and-stop
    // would leave 40/100/100 and 60pt of unexplained space.
    let r = shares(", maxWidth: 40");
    assert_eq!(r[0], 40.0, "frozen at maxWidth");
    assert_eq!(r[1], 130.0);
    assert_eq!(r[2], 130.0);
    assert_eq!(r.iter().sum::<f64>(), 300.0, "the row is exactly filled");
}

#[test]
fn a_min_width_freezes_a_share_and_the_siblings_give_up_the_difference() {
    // The other bound. A `minWidth` floor above the natural share pushes
    // the siblings BELOW theirs, so the deficit flows the opposite way
    // through the same loop.
    let r = shares(", minWidth: 180");
    assert_eq!(r[0], 180.0, "frozen at minWidth");
    assert_eq!(r[1], 60.0);
    assert_eq!(r[2], 60.0);
    assert_eq!(r.iter().sum::<f64>(), 300.0);
}

#[test]
fn a_min_and_a_max_clamping_at_once_terminate_and_fill_the_row() {
    // Two children freeze in the SAME row, at opposite bounds. Each
    // round of the loop freezes at least one item, so it must terminate —
    // and the third child absorbs whatever the other two could not take.
    let children = "- type: container\n  box: { h: 20, flexBasis: 0, flexGrow: 1, minWidth: 180 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: x\n\
                    - type: container\n  box: { h: 20, flexBasis: 0, flexGrow: 1, maxWidth: 30 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: x\n\
                    - type: container\n  box: { h: 20, flexBasis: 0, flexGrow: 1 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: x";
    let yaml = container_body("{ x: 0, y: 0, w: 300, h: 40, direction: row }", children);
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    let r: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|s| s.w).collect();
    assert_eq!(r[0], 180.0, "frozen at its floor");
    assert_eq!(r[1], 30.0, "frozen at its ceiling");
    assert_eq!(r[2], 90.0, "the unfrozen child takes what is left");
    assert_eq!(r.iter().sum::<f64>(), 300.0);
}

#[test]
fn hostile_bounds_on_a_flex_share_stay_finite_and_non_negative() {
    // Hostile bounds, probed AT the admitted maximum rather than trusted
    // from a doc comment — the last time a distribution helper's comment
    // was taken at its word it claimed "shares 0" and returned NaN.
    //
    // A row cursor that walks BACKWARDS is the concrete harm: every
    // width here feeds `cur += outer_w`, so one negative or non-finite
    // share puts the following children at nonsense coordinates.
    for bound in [
        ", maxWidth: 1e308",
        ", minWidth: 1e308",
        ", maxWidth: \"1e308%\"",
        ", minWidth: \"1e308%\"",
        // min above max: CSS resolves it min-wins, and the loop must not
        // oscillate between two bounds that cannot both hold.
        ", minWidth: 500, maxWidth: 10",
    ] {
        let r = shares(bound);
        for w in &r {
            assert!(w.is_finite(), "{bound}: non-finite width {w}");
            assert!(*w >= 0.0, "{bound}: negative width {w}");
        }
    }
}

#[test]
fn a_min_width_floor_that_cannot_fit_still_reports_the_overflow_once() {
    // The floors are what stop a shrink, so a row of them is the case
    // that genuinely cannot be made to fit. It must still be REPORTED —
    // silence here would be the engine quietly drawing outside its box —
    // and reported once, by the row check rather than per child.
    let child = "- type: container\n  box: { h: 20, flexBasis: 0, flexGrow: 1, minWidth: 200 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: x";
    let children = format!("{child}\n{child}");
    let yaml = container_body("{ x: 0, y: 0, w: 300, h: 40, direction: row }", &children);
    let (_, diags) = run(&yaml, json!({}));
    let overflows = diags
        .iter()
        .filter(|d| d.code == "flex_row_overflow")
        .count();
    assert_eq!(overflows, 1, "reported once by the row: {diags:?}");
}

/// Two bordered, content-sized children (no `flexGrow`, so the default 0,
/// and no `flexBasis`, so each starts at its text width) in a row `w`
/// points wide; `bound` is appended to the first child's `box` mapping.
/// Returns each child's border box as `(x, w)`.
fn content_row(w: f64, bound: &str, texts: [&str; 2]) -> Vec<(f64, f64)> {
    let child = |extra: &str, text: &str| {
        format!(
            "- type: container\n  box: {{ h: 20{extra} }}\n  style: {{ borderWidth: 1 }}\n  items:\n    - type: text\n      text: {text}"
        )
    };
    let children = format!("{}\n{}", child(bound, texts[0]), child("", texts[1]));
    let yaml = container_body(
        &format!("{{ x: 0, y: 0, w: {w}, h: 40, direction: row }}"),
        &children,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    rect_shapes(&doc.pages[0])
        .iter()
        .map(|r| (r.x, r.w))
        .collect()
}

#[test]
fn a_child_that_does_not_grow_reserves_its_min_width() {
    // `AB` is about 15pt of text under a 120pt minWidth. The row must
    // reserve the 120pt the child is drawn at, so the sibling starts where
    // that box ends. The previous implementation placed the sibling at the
    // content width, inside the first child's box.
    let r = content_row(300.0, ", minWidth: 120", ["AB", "CD"]);
    assert_eq!(r[0], (0.0, 120.0), "the child takes its minWidth");
    assert_eq!(
        r[1].0, 120.0,
        "the sibling starts after the child at its minWidth"
    );
}

#[test]
fn a_child_that_does_not_grow_reserves_only_its_max_width() {
    // About 119pt of text under a 30pt maxWidth: the row reserves the 30pt
    // the child is drawn at, so the sibling starts right after it. The
    // previous implementation placed the sibling at the content width,
    // leaving a gap after the first child's box.
    let r = content_row(300.0, ", maxWidth: 30", ["ABCDEFGHIJKLMNOP", "CD"]);
    assert_eq!(r[0], (0.0, 30.0), "the child takes its maxWidth");
    assert_eq!(
        r[1].0, 30.0,
        "the sibling starts right after the capped child"
    );
}

#[test]
fn a_shrinking_row_gives_the_width_a_max_width_child_gives_up_to_its_sibling() {
    // Two long texts in a 100pt row, the first with a 30pt maxWidth: the
    // first child is 30 wide and the sibling takes the other 70, so the
    // row is filled. The previous implementation left part of the row
    // unused.
    let r = content_row(
        100.0,
        ", maxWidth: 30",
        ["ABCDEFGHIJKLMNOP", "QRSTUVWXYZABCDEF"],
    );
    assert_eq!(r[0], (0.0, 30.0), "the capped child keeps its maxWidth");
    assert_eq!(r[1], (30.0, 70.0), "the sibling fills the rest of the row");
}

#[test]
fn a_row_whose_min_widths_do_not_fit_shrinks_the_other_child_without_a_warning() {
    // The two texts (about 15pt each) fit the 100pt row, but the first
    // child's 90pt minWidth does not leave room for both: the row shrinks
    // the second child to the 10pt left and reports no overflow, because
    // the shrunk row fits.
    let child = |extra: &str, text: &str| {
        format!(
            "- type: container\n  box: {{ h: 20{extra} }}\n  style: {{ borderWidth: 1 }}\n  items:\n    - type: text\n      text: {text}"
        )
    };
    let children = format!("{}\n{}", child(", minWidth: 90", "AB"), child("", "CD"));
    let yaml = container_body("{ x: 0, y: 0, w: 100, h: 40, direction: row }", &children);
    let (doc, diags) = run(&yaml, json!({}));
    let r: Vec<(f64, f64)> = rect_shapes(&doc.pages[0])
        .iter()
        .map(|s| (s.x, s.w))
        .collect();
    assert_eq!(r, vec![(0.0, 90.0), (90.0, 10.0)]);
    assert!(
        !diags.iter().any(|d| d.code == "flex_row_overflow"),
        "the shrunk row fits: {diags:?}"
    );
}
