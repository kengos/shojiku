//! Grid inputs that have no usable size: a child with no intrinsic width in
//! an `auto` column, an absolutely placed child that has no `w`/`h`, and a
//! fixed row length whose `%` has no container height to be a percentage of.
//! Each falls back to the behavior the reference documents and emits one
//! warning.

use crate::common::*;
use crate::flex::container_body;

fn count(diags: &Diagnostics, code: &str) -> usize {
    diags.iter().filter(|d| d.code == code).count()
}

#[test]
fn an_auto_column_takes_its_width_from_the_children_that_have_one() {
    // The first child is a `rect` with no `w`: it has no authored width and
    // a `rect` has no intrinsic one, so it adds nothing to the `auto`
    // column. The third child (authored `w: 20`) is the only width demand,
    // so the column is 20pt wide and the second column starts at x = 20.
    // The unsized rect warns once, from the placement pass (not the measuring pass).
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"auto\", 50] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { h: 10 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: 30, h: 10 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: 20, h: 10 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert_eq!(count(&diags, "rect_missing_size"), 1, "{diags:?}");
    let rects: Vec<_> = rect_shapes(&doc.pages[0])
        .iter()
        .map(|r| (r.x, r.y, r.w))
        .collect();
    assert_eq!(rects, vec![(20.0, 0.0, 30.0), (0.0, 10.0, 20.0)]);
}

#[test]
fn an_absolute_grid_child_without_a_size_warns_and_takes_no_cell() {
    // `box: { x, y }` places the first rect absolutely, outside the cell
    // fill order. It has no `w`/`h`, so it draws nothing and warns; the
    // second rect is still the first thing placed in the first cell.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2 }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { x: 5, y: 5 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert_eq!(count(&diags, "rect_missing_size"), 1, "{diags:?}");
    let rects: Vec<_> = rect_shapes(&doc.pages[0])
        .iter()
        .map(|r| (r.x, r.y, r.w, r.h))
        .collect();
    assert_eq!(rects, vec![(0.0, 0.0, 100.0, 10.0)]);
}

#[test]
fn a_percent_row_in_an_auto_height_grid_warns_and_sizes_to_its_content() {
    // `50%` of a container with no height has no basis, so the row length
    // is dropped with `percent_of_auto` and the row takes its tallest
    // child instead: the second row starts 10pt down, not at 0 or at a
    // fraction of anything.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 1, rows: [\"50%\"] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert_eq!(count(&diags, "percent_of_auto"), 1, "{diags:?}");
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(ys, vec![0.0, 10.0]);
}
