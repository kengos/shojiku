//! Column flex: stacking, justify/align distribution, auto margins.

use super::*;

#[test]
fn column_flex_children_stack_with_gap() {
    let yaml = container_body("{ x: 0, y: 0, w: 200, h: 100, gap: 10 }", TWO_RECTS);
    assert_eq!(rect_ys(&yaml), vec![0.0, 30.0]);
}

#[test]
fn explicit_box_type_flex_is_accepted_and_equals_the_default() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, type: flex, gap: 10 }",
        TWO_RECTS,
    );
    assert_eq!(rect_ys(&yaml), vec![0.0, 30.0]);
}

#[test]
fn justify_content_distributes_in_a_definite_height_column() {
    let center = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, gap: 10, justifyContent: center }",
        TWO_RECTS,
    );
    assert_eq!(rect_ys(&center), vec![25.0, 55.0]);
    let end = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, gap: 10, justifyContent: end }",
        TWO_RECTS,
    );
    assert_eq!(rect_ys(&end), vec![50.0, 80.0]);
    let between = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, gap: 10, justifyContent: space_between }",
        TWO_RECTS,
    );
    assert_eq!(rect_ys(&between), vec![0.0, 80.0]);
    let around = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, justifyContent: space_around }",
        TWO_RECTS,
    );
    // free 60 → share 30: lead 15, between 30.
    assert_eq!(rect_ys(&around), vec![15.0, 65.0]);
    let evenly = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, justifyContent: space_evenly }",
        TWO_RECTS,
    );
    assert_eq!(rect_ys(&evenly), vec![20.0, 60.0]);
}

#[test]
fn justify_content_is_inert_in_an_auto_height_column() {
    // No definite height → no free space; children just stack, and the
    // container's auto height is their extent.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, gap: 10, justifyContent: center }",
        TWO_RECTS,
    );
    assert_eq!(rect_ys(&yaml), vec![0.0, 30.0]);
}

#[test]
fn align_items_positions_fixed_width_children_on_the_cross_axis() {
    let one_rect = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 100, h: 20 }";
    let center = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, alignItems: center }",
        one_rect,
    );
    let (doc, _) = run(&center, json!({}));
    assert_eq!(rect_shapes(&doc.pages[0])[0].x, 50.0);
    let end = container_body("{ x: 0, y: 0, w: 200, h: 40, alignItems: end }", one_rect);
    let (doc, _) = run(&end, json!({}));
    assert_eq!(rect_shapes(&doc.pages[0])[0].x, 100.0);
    // Default (stretch): a fixed-width child aligns like start.
    let default = container_body("{ x: 0, y: 0, w: 200, h: 40 }", one_rect);
    let (doc, _) = run(&default, json!({}));
    assert_eq!(rect_shapes(&doc.pages[0])[0].x, 0.0);
}

#[test]
fn auto_cross_margins_center_and_push_and_beat_align_items() {
    let centered = container_body(
        "{ x: 0, y: 0, w: 200, h: 40 }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 100, h: 20, margin: { left: auto, right: auto } }",
    );
    let (doc, _) = run(&centered, json!({}));
    assert_eq!(rect_shapes(&doc.pages[0])[0].x, 50.0);
    // A single left auto pushes right, overriding alignItems: start.
    let pushed = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, alignItems: start }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 100, h: 20, margin: { left: auto } }",
    );
    let (doc, _) = run(&pushed, json!({}));
    assert_eq!(rect_shapes(&doc.pages[0])[0].x, 100.0);
}

#[test]
fn auto_main_margins_absorb_column_free_space_before_justify() {
    let pushed_down = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, justifyContent: center }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 200, h: 20, margin: { top: auto } }",
    );
    // top auto takes all 80pt of free space; justify gets none.
    assert_eq!(rect_ys(&pushed_down), vec![80.0]);
    let centered = container_body(
        "{ x: 0, y: 0, w: 200, h: 100 }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 200, h: 20, margin: { top: auto, bottom: auto } }",
    );
    assert_eq!(rect_ys(&centered), vec![40.0]);
}

#[test]
fn nested_flex_containers_distribute_recursively() {
    let children = "- type: container\n  box: { h: 30, justifyContent: end }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { w: 200, h: 10 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, justifyContent: end }",
        children,
    );
    let (doc, _) = run(&yaml, json!({}));
    // Outer: free 70 → inner container at y 70; inner: free 20 → rect +20.
    assert_eq!(rect_shapes(&doc.pages[0])[0].y, 90.0);
}

#[test]
fn column_cross_alignment_shifts_text_lines_and_nested_lines() {
    // A fixed-width text child centers (the text-line x shift), and a
    // fixed-width container child carrying a line item centers with its
    // line coordinates shifted too.
    let children = "- type: text\n  box: { w: 100, h: 12 }\n  text: aaa\n- type: container\n  box: { w: 100, h: 10 }\n  items:\n    - type: line\n      from: { x: 0, y: 0 }\n      to: { x: 100, y: 0 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 60, alignItems: center }",
        children,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "aaa").0, 50.0);
    let line = line_shapes(&doc.pages[0])[0];
    assert_eq!((line.x1, line.x2), (50.0, 150.0));
}

/// A column holding one `flexGrow: 1` child above a fixed 20pt one, both
/// bordered so their boxes report their heights. `column_box` decides
/// whether the parent height is definite.
fn grow_column(column_box: &str) -> Vec<(f64, f64)> {
    let yaml = container_body(
        column_box,
        "- type: container\n  box: { flexGrow: 1 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: a\n\
         - type: container\n  box: { h: 20 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: b",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    rect_shapes(&doc.pages[0])
        .iter()
        .map(|r| (r.y, r.h))
        .collect()
}

#[test]
fn flex_grow_takes_the_leftover_height_of_a_definite_column() {
    // T17: a column's MAIN axis is the height, so `flexGrow` there is the
    // same flexible-length resolution a row runs on width. The grower
    // starts at its CONTENT height and takes everything the fixed sibling
    // leaves, so the two must exactly fill the parent.
    let r = grow_column("{ x: 0, y: 0, w: 200, h: 100 }");
    assert_eq!(r[0].1, 80.0, "grower takes 100 - 20");
    assert_eq!(r[1].1, 20.0, "an authored `h` is untouched");
    assert_eq!(r[1].0, 80.0, "and is pushed down by the growth");
}

#[test]
fn flex_grow_does_nothing_in_an_auto_height_column() {
    // The discriminating opposite, asserted against the case above: with
    // no definite parent height there is no leftover to take, so the same
    // child keeps its content height. CSS says the same — an indefinite
    // main size means no free space to resolve against.
    let r = grow_column("{ x: 0, y: 0, w: 200 }");
    assert!(r[0].1 < 80.0, "no growth without a height, got {}", r[0].1);
    assert_eq!(r[1].1, 20.0);
    assert_eq!(r[1].0, r[0].1, "stacked directly under the ungrown child");
}

#[test]
fn flex_grow_shares_a_column_by_weight_and_freezes_at_max_height() {
    // Two growers at 1 and 3 split the leftover 3:1 — the assertion that
    // separates a real weighted resolution from "the last child fills".
    // The `maxHeight` on the heavier one then freezes it mid-loop and its
    // surplus goes back to the lighter one, which is what distinguishes
    // the CSS freeze loop from a single clamp-and-stop.
    let child = |extra: &str| {
        format!(
            "- type: container\n  box: {{ flexGrow: 1 }}\n  style: {{ borderWidth: 1 }}\n  items:\n    - type: text\n      text: a\n\
             - type: container\n  box: {{ flexGrow: 3{extra} }}\n  style: {{ borderWidth: 1 }}\n  items:\n    - type: text\n      text: b"
        )
    };
    let heights = |extra: &str| {
        let yaml = container_body("{ x: 0, y: 0, w: 200, h: 100 }", &child(extra));
        let (doc, diags) = run(&yaml, json!({}));
        assert!(!diags.has_errors(), "{diags:?}");
        let r = rect_shapes(&doc.pages[0]);
        (r[0].h, r[1].h)
    };
    let (light, heavy) = heights("");
    assert_eq!(light + heavy, 100.0, "the pair fills the column");
    assert!(
        heavy > light,
        "weight 3 outgrows weight 1: {heavy} vs {light}"
    );
    // Freeze the heavy one well under its unclamped share; the whole
    // surplus must land on its sibling rather than being dropped.
    let (light_capped, heavy_capped) = heights(", maxHeight: 30");
    assert_eq!(heavy_capped, 30.0, "frozen at maxHeight");
    assert_eq!(light_capped, 70.0, "and the surplus redistributes");
}

#[test]
fn a_column_that_already_overflows_keeps_its_content_heights() {
    // Grow only: unlike a row, a column does NOT shrink its children back
    // to fit. Shrinking a width re-wraps text and keeps it visible; there
    // is no vertical equivalent, so the children keep the heights they
    // measured and the usual overflow reporting handles the rest.
    let r = grow_column("{ x: 0, y: 0, w: 200, h: 10 }");
    assert!(r[0].1 > 0.0, "grower keeps its content height");
    assert_eq!(r[1].1, 20.0, "and the fixed child is not squeezed");
}

#[test]
fn a_negative_flex_grow_on_a_column_child_warns_and_does_not_grow() {
    // The column planner sanitizes `flexGrow` on its own path, BEFORE it
    // decides whether there is anything to grow — so the warning survives
    // the early return that a row-only test would never exercise. Without
    // this, moving the sanitization one line later would lose the
    // diagnostic on this axis and no gate would say so.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100 }",
        "- type: container\n  box: { flexGrow: -1 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: a\n\
         - type: container\n  box: { h: 20 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: b",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "invalid_flex_grow"),
        "{diags:?}"
    );
    // Degraded to 0, so nothing grew: the child keeps its content height
    // and the fixed sibling stacks directly under it.
    let r = rect_shapes(&doc.pages[0]);
    assert!(r[0].h < 80.0, "must not have grown, got {}", r[0].h);
    assert_eq!(r[1].y, r[0].h);
}
