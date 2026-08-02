//! Which marks draw, and the load-bearing invariant that geometry does
//! not move between blank and filled params.

use super::flow;
use crate::common::*;

#[test]
fn ellipse_decoration_always_draws() {
    let (doc, diags) = run(
        &flow("      - type: ellipse\n        box: { x: 10, y: 10, w: 60, h: 30 }\n"),
        json!({}),
    );
    let paths = path_shapes(&doc.pages[0]);
    assert_eq!(paths.len(), 1);
    assert_eq!(paths[0].stroke, Some((0.0, 0.0, 0.0)));
    assert_eq!(paths[0].fill, None);
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn ellipse_equals_draws_only_the_match() {
    let items = "      - type: ellipse\n        box: { x: 10, y: 10, w: 20, h: 14 }\n        data: { key: payment, equals: \"現金\" }\n      - type: ellipse\n        box: { x: 40, y: 10, w: 20, h: 14 }\n        data: { key: payment, equals: \"カード\" }\n";
    let (doc, _) = run(&flow(items), json!({ "payment": "現金" }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 1);
    let (doc, _) = run(&flow(items), json!({ "payment": "カード" }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 1);
    // A value matching neither draws no ellipse (but see the geometry
    // invariant below — the boxes are still reserved).
    let (doc, _) = run(&flow(items), json!({ "payment": "振込" }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
}

#[test]
fn checkbox_frame_always_draws_check_is_conditional() {
    let items = "      - type: checkbox\n        box: { x: 10, y: 10, w: 10, h: 10 }\n        data: { key: agree }\n";
    let (doc, _) = run(&flow(items), json!({ "agree": true }));
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1, "frame");
    assert_eq!(path_shapes(&doc.pages[0]).len(), 1, "check");
    let (doc, _) = run(&flow(items), json!({ "agree": false }));
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1, "frame stays");
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0, "no check");
}

#[test]
fn checkbox_static_checked_and_empty() {
    let checked = "      - type: checkbox\n        box: { x: 10, y: 10, w: 10, h: 10 }\n        checked: true\n";
    let (doc, _) = run(&flow(checked), json!({}));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 1);
    let empty = "      - type: checkbox\n        box: { x: 10, y: 10, w: 10, h: 10 }\n";
    let (doc, _) = run(&flow(empty), json!({}));
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1);
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
}

#[test]
fn boolean_binding_without_equals_draws_on_true() {
    let items = "      - type: ellipse\n        box: { x: 10, y: 10, w: 20, h: 14 }\n        data: { key: flag }\n";
    let (doc, _) = run(&flow(items), json!({ "flag": true }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 1);
    let (doc, _) = run(&flow(items), json!({ "flag": false }));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
}

#[test]
fn unmatched_mark_still_reserves_its_box() {
    // A checkbox (reserved h=20), then a text line. The text's y must be
    // identical whether the check draws or not — the one-template thesis.
    let items = "      - type: checkbox\n        box: { x: 10, y: 0, w: 20, h: 20 }\n        data: { key: agree }\n      - type: text\n        text: below\n";
    let (checked, _) = run(&flow(items), json!({ "agree": true }));
    let (blank, _) = run(&flow(items), json!({ "agree": false }));
    let y = |doc: &LayoutDocument| text_blocks(&doc.pages[0])[0].lines[0].y;
    assert_eq!(y(&checked), y(&blank));
}
