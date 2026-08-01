//! Checkbox auto-size: an omitted `box.w`/`box.h` defaults the frame to
//! the inherited font's cap-height square, while a standalone `ellipse`
//! still requires an explicit size.

use super::flow;
use crate::common::*;

/// A checkbox with the given `box:` body, inside a container that sets the
/// inherited font size so the cap-height default is deterministic.
fn boxed(size: u32, box_body: &str) -> String {
    flow(&format!(
        r"      - type: container
        style: {{ fontSize: {size}, fontFamily: biz-ud-gothic }}
        items:
          - type: checkbox
            box: {{ {box_body} }}
"
    ))
}

#[test]
fn omitted_size_defaults_to_a_cap_height_square() {
    // At 20pt the cap height is well under the em; the frame is a square
    // in the plausible cap band (roughly 0.6–0.85em), not the full em.
    let (doc, diags) = run(&boxed(20, "x: 0, y: 0"), json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let frames = rect_shapes(&doc.pages[0]);
    assert_eq!(frames.len(), 1);
    let f = frames[0];
    assert!(
        (f.w - f.h).abs() < 1e-9,
        "square frame, got {}x{}",
        f.w,
        f.h
    );
    assert!(
        f.w > 11.0 && f.w < 18.0,
        "cap-height square at 20pt, got {}",
        f.w
    );
}

#[test]
fn an_explicit_size_still_wins() {
    let (doc, _) = run(&boxed(20, "x: 0, y: 0, w: 9, h: 9"), json!({}));
    let f = rect_shapes(&doc.pages[0])[0];
    assert_eq!((f.w, f.h), (9.0, 9.0));
}

#[test]
fn a_standalone_ellipse_without_size_is_skipped() {
    // The auto-size default is a checkbox affordance only.
    let (doc, diags) = run(
        &flow("      - type: ellipse\n        box: { x: 0, y: 0 }\n"),
        json!({}),
    );
    assert!(path_shapes(&doc.pages[0]).is_empty());
    assert!(diags.iter().any(|d| d.code == "mark_missing_size"));
}
