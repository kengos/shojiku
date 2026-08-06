//! Row flex: side-by-side placement, equal shares, cross alignment.

use super::*;

#[test]
fn row_places_fixed_width_children_side_by_side() {
    let two = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 20 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, gap: 10 }",
        two,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let xs: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.x).collect();
    assert_eq!(xs, vec![0.0, 90.0]);
    // free = 200 - 170 = 30: end shifts the whole row right.
    let end = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, gap: 10, justifyContent: end }",
        two,
    );
    let (doc, _) = run(&end, json!({}));
    let xs: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.x).collect();
    assert_eq!(xs, vec![30.0, 120.0]);
}

#[test]
fn row_children_without_width_split_the_leftover_equally() {
    let children = "- type: container\n  box: { h: 20 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }\n- type: container\n  box: { h: 20 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, gap: 10 }",
        children,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let rects = rect_shapes(&doc.pages[0]);
    // (200 - 10) / 2 = 95 per share; the inner rects fill their share.
    assert_eq!((rects[0].x, rects[0].w), (0.0, 95.0));
    assert_eq!((rects[1].x, rects[1].w), (105.0, 95.0));
}

#[test]
fn row_unsized_children_split_leftover_by_flex_grow() {
    // Two unsized children weighted 2:1 split the 120pt leftover (w 130,
    // gap 10) as 80:40 instead of the equal 60:60 (D4).
    let children = "- type: container\n  box: { h: 20, flexGrow: 2 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }\n- type: container\n  box: { h: 20, flexGrow: 1 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 130, h: 40, direction: row, gap: 10 }",
        children,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].w), (0.0, 80.0));
    assert_eq!((rects[1].x, rects[1].w), (90.0, 40.0));
}

#[test]
fn row_flex_grow_ignores_fixed_sibling_and_warns_on_negative() {
    // A fixed-width child is excluded from the weighted split; the two
    // unsized children (weights 2:1) share the 180pt leftover as 120:60.
    let children = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 60, h: 20 }\n- type: container\n  box: { h: 20, flexGrow: 2 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }\n- type: container\n  box: { h: 20, flexGrow: 1 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }";
    let yaml = container_body("{ x: 0, y: 0, w: 240, h: 40, direction: row }", children);
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    // rects[0] is the fixed sibling; the two inner fills follow it.
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[1].x, rects[1].w), (60.0, 120.0));
    assert_eq!((rects[2].x, rects[2].w), (180.0, 60.0));

    // A negative weight warns and degrades to 0, so its sibling takes all.
    let neg = "- type: container\n  box: { h: 20, flexGrow: -1 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }\n- type: container\n  box: { h: 20, flexGrow: 1 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 10 }";
    let yaml = container_body("{ x: 0, y: 0, w: 100, h: 40, direction: row }", neg);
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "invalid_flex_grow"));
    let rects = rect_shapes(&doc.pages[0]);
    // The negative-weight child collapsed (its fill floors near 0); the
    // sibling took the full width.
    assert!(
        rects[0].w <= 1.0,
        "collapsed child too wide: {}",
        rects[0].w
    );
    assert_eq!((rects[1].x, rects[1].w), (0.0, 100.0));
}

#[test]
fn row_cross_axis_aligns_and_auto_vertical_margin_pushes_down() {
    let two = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 30 }";
    let center = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, alignItems: center }",
        two,
    );
    let (doc, _) = run(&center, json!({}));
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(ys, vec![10.0, 5.0]);
    // Default stretch keeps measured heights top-aligned (v1: no cross
    // stretching in rows).
    let default = container_body("{ x: 0, y: 0, w: 200, h: 40, direction: row }", two);
    let (doc, _) = run(&default, json!({}));
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(ys, vec![0.0, 0.0]);
    let auto = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 80, h: 20, margin: { top: auto } }",
    );
    let (doc, _) = run(&auto, json!({}));
    assert_eq!(rect_shapes(&doc.pages[0])[0].y, 20.0);
}

#[test]
fn row_auto_horizontal_margins_absorb_free_space() {
    // All-fixed row: {left: auto, right: auto} centers the lone child.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 100, h: 20, margin: { left: auto, right: auto } }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    assert_eq!(rect_shapes(&doc.pages[0])[0].x, 50.0);
}

#[test]
fn row_mixes_unsized_text_with_a_fixed_image_and_aligns_images() {
    // The text child (no `w`) takes the leftover share next to the
    // fixed-width image; a second flexed image is end-aligned on the
    // cross axis (the image x/y shift paths).
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, h: 40, direction: row, gap: 10 }
        items:
          - type: image
            box: { w: 30, h: 30 }
            src: logo.png
          - type: text
            text: aaa
      - type: container
        box: { x: 0, y: 60, w: 200, h: 40, alignItems: end }
        items:
          - type: image
            box: { w: 30, h: 30 }
            src: logo.png
"#;
    let (doc, diags) = run_with_assets(yaml, json!({}), Some(&test_assets()));
    assert!(!diags.has_errors(), "{diags:?}");
    let images = image_shapes(&doc.pages[0]);
    assert_eq!(images[0].x, 0.0);
    // Text starts after the image slot + gap: 30 + 10.
    assert_eq!(cell_pos(&doc.pages[0], "aaa").0, 40.0);
    // Cross-end in the second container: x = 200 - 30.
    assert_eq!(images[1].x, 170.0);
}

#[test]
fn out_of_range_child_width_warns_once_after_dedup() {
    // The row pre-pass (`plan_row`) resolves each child's width and the
    // atom pass resolves it again; the identical `length_out_of_range`
    // warnings collapse to one at the layout output boundary.
    let child = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 3000000, h: 20 }";
    let yaml = container_body("{ x: 0, y: 0, w: 200, h: 40, direction: row }", child);
    let (_doc, diags) = run(&yaml, json!({}));
    assert_eq!(
        diags
            .iter()
            .filter(|d| d.code == "length_out_of_range")
            .count(),
        1,
        "pre-pass + atom double resolve must dedup: {diags:?}"
    );
}

#[test]
fn percent_margins_of_an_unsized_row_child_resolve_against_the_container() {
    // CSS resolves a flex item's `%` margins against the flex CONTAINER,
    // not against the slot the item ended up with. The engine used to do
    // the latter, which made an authored `10%` mean a different number
    // depending on how many siblings the child had.
    //
    // 200pt row, two unsized children, `margin: { left: "10%" }` on the
    // first: 10% of 200 = 20pt. Against its own ~100pt share it would
    // have been ~10pt — the two numbers discriminate.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, direction: row }",
        "- type: container\n  box: { margin: { left: \"10%\" }, flexBasis: 0 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { w: \"100%\", h: 10 }\n- type: text\n  text: x\n  box: { flexBasis: 0 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    let r = rect_shapes(&doc.pages[0]);
    assert_eq!(r[0].x, 20.0, "10% of the 200pt container, not of the share");
}

/// A definite-height row holding one cross-unsized child and one with an
/// authored `h`, both bordered so their boxes report their heights.
fn stretch_row(row_box: &str) -> Vec<(f64, f64, f64, f64)> {
    let yaml = container_body(
        row_box,
        "- type: container\n  box: { flexBasis: 0 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: a\n\
         - type: container\n  box: { flexBasis: 0, h: 20 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: b",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    rect_shapes(&doc.pages[0])
        .iter()
        .map(|r| (r.x, r.y, r.w, r.h))
        .collect()
}

#[test]
fn align_items_stretch_resizes_a_cross_unsized_row_child() {
    // `stretch` is the DEFAULT `alignItems`, and in a row the cross axis
    // is the height. A child with no authored `h` now fills the row's
    // cross size instead of keeping its content height — the mirror of an
    // unsized WIDTH filling a column's cross axis.
    //
    // Asserted on the HEIGHT, not the y offset: aligning a child at y=0
    // and resizing it to the row are indistinguishable by position, and
    // only the second is what `stretch` means.
    let r = stretch_row("{ x: 0, y: 0, w: 200, h: 100, direction: row }");
    assert_eq!(r[0].3, 100.0, "cross-unsized child fills the row height");
    assert_eq!(r[1].3, 20.0, "an authored `h` is untouched");
}

#[test]
fn align_items_start_leaves_a_row_child_at_its_content_height() {
    // The discriminating opposite: with `stretch` turned off the same
    // child keeps the content height it had before this behaviour
    // existed, well short of the row.
    let r = stretch_row("{ x: 0, y: 0, w: 200, h: 100, direction: row, alignItems: start }");
    assert!(r[0].3 < 100.0, "no stretch under `start`, got {}", r[0].3);
    assert_eq!(r[1].3, 20.0);
}

/// An AUTO-height row (no definite parent height) holding a one-line
/// child beside a three-line one, both bordered. Returns their heights.
fn auto_height_row(extra: &str, align: &str) -> (f64, f64) {
    let yaml = container_body(
        &format!("{{ x: 0, y: 0, w: 200, direction: row{align} }}"),
        &format!(
            "- type: container\n  box: {{ flexBasis: 0{extra} }}\n  style: {{ borderWidth: 1 }}\n  items:\n    - type: text\n      text: one line\n\
             - type: container\n  box: {{ flexBasis: 0 }}\n  style: {{ borderWidth: 1 }}\n  items:\n    - type: text\n      text: \"three\\nlines\\nhere\""
        ),
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    let r = rect_shapes(&doc.pages[0]);
    (r[0].h, r[1].h)
}

#[test]
fn align_items_stretch_fills_an_auto_height_row_from_its_tallest_child() {
    // With no definite parent height the row's cross size is the
    // tallest child (CSS Flexbox §9.4 — the line's cross size is the
    // largest hypothetical outer cross size), so the SHORTER child grows
    // to meet it. Discriminated against the same fixture under `start`,
    // where the two keep their own content heights.
    let (short_start, tall_start) = auto_height_row("", ", alignItems: start");
    assert!(
        short_start < tall_start,
        "fixture must have unequal children: {short_start} vs {tall_start}"
    );

    let (short, tall) = auto_height_row("", "");
    assert_eq!(short, tall, "both fill the row's cross size");
    assert_eq!(tall, tall_start, "which is the tallest child's own height");
    assert!(short > short_start, "the short child grew");
}

#[test]
fn an_auto_cross_margin_opts_a_row_child_out_of_stretch() {
    // CSS stretches an item only when NEITHER cross-axis margin is
    // `auto` — an auto margin means "position me", which filling the
    // line would silently overrule.
    let (short, tall) = auto_height_row(", margin: { top: auto }", "");
    assert!(
        short < tall,
        "auto margin opts out of stretch: {short} vs {tall}"
    );
}
