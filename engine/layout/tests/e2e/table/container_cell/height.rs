//! Row sizing with container cells: an auto row is as tall as its
//! tallest cell, `minHeight` floors it, a fixed `row.height` wins and
//! hands overflow to the cell's own policy — and the height measure
//! stays silent (only the render pass speaks).

use super::{box_at, cell_table, codes};
use crate::common::*;

#[test]
fn auto_row_is_as_tall_as_the_tallest_cell() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 700 }
    items:
      - type: table
        data: { key: rows }
        style: { borderWidth: 0 }
        row: { minHeight: 10 }
        columns:
          - width: 100
            cell:
              items:
                - { type: rect, box: { w: 20, h: 40 } }
          - width: 100
            cell:
              items:
                - { type: rect, box: { w: 20, h: 70 } }
"#,
        json!({ "rows": [{}] }),
    );
    // The 70pt cell decides the row; both cells fill it.
    assert_eq!(
        box_at(&out, "sections.body.items[0].columns[0]", 0)
            .border
            .h,
        70.0
    );
    assert_eq!(
        box_at(&out, "sections.body.items[0].columns[1]", 0)
            .border
            .h,
        70.0
    );
}

#[test]
fn min_height_floors_a_short_cell() {
    let out = cell_table(
        "minHeight: 100",
        "              items:\n                - { type: rect, box: { w: 20, h: 40 } }",
        json!([{}]),
    );
    assert_eq!(
        box_at(&out, "sections.body.items[0].columns[0]", 0)
            .border
            .h,
        100.0
    );
}

#[test]
fn cell_box_margins_grow_the_row() {
    // The cell's own vertical margins are part of what it occupies, so an
    // auto row reserves them like a container child's.
    let out = cell_table(
        "minHeight: 10",
        "              box: { margin: { top: 5, bottom: 7 } }\n              items:\n                - { type: rect, box: { w: 20, h: 30 } }",
        json!([{}]),
    );
    assert_eq!(
        box_at(&out, "sections.body.items[0].columns[0]", 0)
            .border
            .h,
        42.0
    );
}

#[test]
fn fixed_row_height_wins_over_the_cell_content() {
    let out = cell_table(
        "height: 30",
        "              items:\n                - { type: rect, box: { w: 20, h: 60 }, style: { backgroundColor: \"#ff0000\" } }",
        json!([{}]),
    );
    assert_eq!(
        box_at(&out, "sections.body.items[0].columns[0]", 0)
            .border
            .h,
        30.0
    );
    // Default `overflow: visible`: the too-tall rect still draws.
    let rects = rect_shapes(&out.document.pages[0]);
    assert!(
        rects.iter().any(|r| r.h == 60.0),
        "the rect draws over the row"
    );
    assert!(crate::clip::clip_shapes(&out.document.pages[0]).is_empty());
}

#[test]
fn overflow_hidden_clips_the_cell_to_a_fixed_row() {
    let out = cell_table(
        "height: 30",
        "              style: { overflow: hidden }\n              items:\n                - { type: rect, box: { w: 20, h: 60 }, style: { backgroundColor: \"#ff0000\" } }",
        json!([{}]),
    );
    let page = &out.document.pages[0];
    let clip = crate::clip::only_clip(page);
    assert_eq!(clip.h, 30.0, "the clip is the cell, not the content");
    // The rect moved inside the clip group.
    assert!(rect_shapes(page).iter().all(|r| r.h != 60.0));
    assert!(clip
        .items
        .iter()
        .any(|i| matches!(i, LayoutItem::Rect(r) if r.h == 60.0)));
}

#[test]
fn percent_height_resolves_against_the_decided_row_without_warning() {
    // The row is auto: the measure pass sees an UNKNOWN height and would
    // warn `percent_of_auto` about the second cell's `50%`. Only the
    // render pass — which knows the row is 40pt — is allowed to speak.
    let out = run_full(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 700 }
    items:
      - type: table
        data: { key: rows }
        style: { borderWidth: 0 }
        row: { minHeight: 10 }
        columns:
          - width: 100
            cell:
              items:
                - { type: rect, box: { w: 20, h: 40 } }
          - width: 100
            cell:
              items:
                - { type: rect, box: { w: 20, h: "50%", }, style: { backgroundColor: "#ff0000" } }
"##,
        json!({ "rows": [{}] }),
    );
    assert_eq!(
        box_at(&out, "sections.body.items[0].columns[0]", 0)
            .border
            .h,
        40.0
    );
    let rects = rect_shapes(&out.document.pages[0]);
    assert!(rects.iter().any(|r| r.h == 20.0), "50% of the 40pt row");
    assert!(
        !codes(&out).contains(&"percent_of_auto".to_string()),
        "the measure pass must not warn: {:?}",
        codes(&out)
    );
}

#[test]
fn the_render_pass_still_warns_after_a_silent_measure() {
    // The measure pass runs first and hits the same unknown family. Its
    // warning is discarded — but it must not mark the family "already
    // warned" and silence the render pass's real one.
    let out = cell_table(
        "minHeight: 10",
        "              items:\n                - { type: text, text: hi, style: { fontFamily: no-such-face } }",
        json!([{}]),
    );
    assert!(
        codes(&out).contains(&"unknown_font_family".to_string()),
        "expected the render pass to warn: {:?}",
        codes(&out)
    );
}
