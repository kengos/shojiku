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
