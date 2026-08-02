//! Geometry (path shape, id boxes, units), placement (repeat-cell scope,
//! flex), and hostile-input guards.

use super::flow;
use crate::common::*;

#[test]
fn ellipse_is_four_cubics_check_is_a_polyline() {
    use shojiku_image::PathCmd;
    let (doc, _) = run(
        &flow("      - type: ellipse\n        box: { x: 0, y: 0, w: 20, h: 14 }\n"),
        json!({}),
    );
    let ellipse = &path_shapes(&doc.pages[0])[0].cmds;
    // MoveTo + 4 CurveTo + Close.
    assert_eq!(ellipse.len(), 6);
    assert!(matches!(ellipse[0], PathCmd::MoveTo(..)));
    assert!(matches!(ellipse[5], PathCmd::Close));

    let (doc, _) = run(
        &flow("      - type: checkbox\n        box: { x: 0, y: 0, w: 10, h: 10 }\n        checked: true\n"),
        json!({}),
    );
    let check = &path_shapes(&doc.pages[0])[0].cmds;
    assert_eq!(check.len(), 3, "MoveTo + 2 LineTo");
    assert!(matches!(check[0], PathCmd::MoveTo(..)));
}

#[test]
fn zero_border_width_suppresses_stroke_but_keeps_fill() {
    let (doc, _) = run(
        &flow("      - type: ellipse\n        box: { x: 0, y: 0, w: 20, h: 14 }\n        style: { borderWidth: 0, backgroundColor: \"#ff0000\" }\n"),
        json!({}),
    );
    let path = path_shapes(&doc.pages[0])[0];
    assert_eq!(path.stroke, None);
    assert_eq!(path.fill, Some((1.0, 0.0, 0.0)));
}

#[test]
fn unauthored_border_width_defaults_the_mark_outline_to_1pt() {
    // No layer authors a width → the mark keeps its 1pt frame (a mark's
    // visible geometry is its function), while a NAMED-style width is
    // "authored" and replaces the default.
    let (doc, diags) = run(
        "styles:\n  thick: { borderWidth: 3 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: ellipse\n        box: { x: 0, y: 0, w: 20, h: 14 }\n      - type: ellipse\n        box: { x: 0, y: 0, w: 20, h: 14 }\n        styleNames: [thick]\n",
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let paths = path_shapes(&doc.pages[0]);
    assert_eq!(paths[0].stroke_width, 1.0, "default outline");
    assert_eq!(paths[1].stroke_width, 3.0, "named-style width wins");
}

#[test]
fn a_width_in_a_name_past_the_style_names_cap_does_not_count_as_authored() {
    // resolve_style applies only the first MAX_STYLE_NAMES (16) names;
    // the authored-width detection must use the same window, so a width
    // hiding in name #17 neither applies NOR suppresses the 1pt default.
    let names: Vec<String> = (0..16)
        .map(|i| format!("s{i}"))
        .chain(["thick".to_string()])
        .collect();
    let styles: String = (0..16).map(|i| format!("  s{i}: {{}}\n")).collect();
    let (doc, diags) = run(
        &format!(
            "styles:\n{styles}  thick: {{ borderWidth: 3 }}\nsections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    items:\n      - type: ellipse\n        box: {{ x: 0, y: 0, w: 20, h: 14 }}\n        styleNames: [{}]\n",
            names.join(", ")
        ),
        json!({}),
    );
    // (The over-cap list itself warns at VALIDATE time — covered in the
    // core validate tests; this layout run only checks the paint.)
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(
        path_shapes(&doc.pages[0])[0].stroke_width,
        1.0,
        "capped-out width neither applies nor suppresses the default"
    );
}

#[test]
fn per_side_border_on_a_mark_reduces_to_the_top_side_with_a_warning() {
    let (doc, diags) = run(
        &flow("      - type: ellipse\n        box: { x: 0, y: 0, w: 20, h: 14 }\n        style: { borderWidth: { top: 2, left: 5 } }\n"),
        json!({}),
    );
    assert!(
        diags.iter().any(|d| d.code == "shape_border_sides_ignored"),
        "expected the reduction warning: {diags:?}"
    );
    assert_eq!(path_shapes(&doc.pages[0])[0].stroke_width, 2.0, "top side");
}

#[test]
fn em_rem_sizing_resolves() {
    // rem root is the 10pt document default → a 1rem box is 10pt.
    let (doc, _) = run(
        &flow("      - type: checkbox\n        box: { x: 0, y: 0, w: 1rem, h: 1rem }\n        checked: true\n"),
        json!({}),
    );
    assert_eq!(rect_shapes(&doc.pages[0])[0].w, 10.0);
    assert_eq!(path_shapes(&doc.pages[0]).len(), 1);
}

#[test]
fn id_lands_in_the_box_index() {
    let out = run_full(
        &flow("      - type: checkbox\n        id: agree_box\n        box: { x: 5, y: 5, w: 10, h: 10 }\n"),
        json!({}),
    );
    assert!(out.boxes.pages[0]
        .iter()
        .any(|b| b.id.as_deref() == Some("agree_box")));
}

#[test]
fn ellipse_without_a_size_warns_and_skips() {
    // A standalone ellipse still needs an explicit size (a checkbox
    // auto-sizes instead — see `auto_size.rs`).
    let (doc, diags) = run(
        &flow("      - type: ellipse\n        box: { x: 5, y: 5 }\n"),
        json!({}),
    );
    assert!(path_shapes(&doc.pages[0]).is_empty());
    assert!(rect_shapes(&doc.pages[0]).is_empty());
    assert!(
        diags.iter().any(|d| d.code == "mark_missing_size"),
        "{diags:?}"
    );
}

#[test]
fn checkbox_frame_honors_fill_and_border_color() {
    let (doc, _) = run(
        &flow("      - type: checkbox\n        box: { x: 5, y: 5, w: 20, h: 20 }\n        style: { backgroundColor: \"#eeeeee\", borderColor: \"#0000ff\" }\n"),
        json!({}),
    );
    let frame = rect_shapes(&doc.pages[0])[0];
    assert!(frame.fill.is_some(), "backgroundColor honored");
    assert_eq!(frame.stroke, Some((0.0, 0.0, 1.0)), "blue border");
}

#[test]
fn marks_are_element_scoped_in_a_repeat_cell() {
    let tmpl = "\npage: { size: A4 }\nsections:\n  body:\n    type: flow\n    items:\n      - type: repeat\n        data: { key: rows }\n        grid: { columns: 1, rows: 2 }\n        cell:\n          items:\n            - type: checkbox\n              box: { x: 0, y: 0, w: 10, h: 10 }\n              data: { key: on }\n";
    let (doc, _) = run(tmpl, json!({ "rows": [{ "on": true }, { "on": false }] }));
    // Two frames (one per element), one check (the first element only).
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 2);
    assert_eq!(path_shapes(&doc.pages[0]).len(), 1);
}

#[test]
fn marks_place_as_flex_children() {
    let tmpl = "\npage: { size: A4 }\nsections:\n  body:\n    type: flow\n    items:\n      - type: container\n        box: { x: 0, y: 0, w: 200, h: 100, type: flex, direction: column }\n        items:\n          - type: ellipse\n            box: { w: 20, h: 14 }\n          - type: checkbox\n            box: { w: 10, h: 10 }\n            checked: true\n";
    let (doc, diags) = run(tmpl, json!({}));
    // The ellipse (a Path) and the checkbox check (a Path) stack; the
    // checkbox frame is a Rect.
    assert_eq!(path_shapes(&doc.pages[0]).len(), 2);
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1);
    assert!(diags.is_empty(), "{diags:?}");
}
