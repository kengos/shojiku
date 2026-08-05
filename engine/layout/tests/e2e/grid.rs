//! Static grid placement (`box.type: grid`, box-model Phase 3): track
//! sizing, fill order, row heights, gaps, alignment, and the
//! hostile-input clamps.

mod fr;
mod spans;
mod track_width;

use crate::common::*;

use crate::flex::container_body;

pub(crate) fn rects(yaml: &str) -> Vec<(f64, f64, f64, f64)> {
    let (doc, diags) = run(yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    rect_shapes(&doc.pages[0])
        .iter()
        .map(|r| (r.x, r.y, r.w, r.h))
        .collect()
}

const FOUR_RECTS: &str = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 30 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }";

#[test]
fn grid_without_columns_defaults_to_one_full_width_column() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }",
    );
    let r = rects(&yaml);
    assert_eq!((r[0].0, r[0].2), (0.0, 200.0));
    // One column: the second child starts the second (auto) row.
    assert_eq!((r[1].0, r[1].1), (0.0, 10.0));
}

#[test]
fn count_columns_tile_row_major_with_auto_row_heights() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2, columnGap: 10 }",
        FOUR_RECTS,
    );
    let r = rects(&yaml);
    // Tracks: (200-10)/2 = 95 wide; `100%` of the cell fills it.
    assert_eq!(r[0], (0.0, 0.0, 95.0, 20.0));
    assert_eq!(r[1], (105.0, 0.0, 95.0, 20.0));
    // Second row starts after the tallest of row one (20) — no rowGap.
    assert_eq!(r[2], (0.0, 20.0, 95.0, 30.0));
    assert_eq!(r[3], (105.0, 20.0, 95.0, 20.0));
}

#[test]
fn explicit_column_tracks_resolve_lengths_and_leftover_justifies() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"25%\", 50] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let r = rects(&yaml);
    assert_eq!((r[0].0, r[0].2), (0.0, 50.0));
    assert_eq!((r[1].0, r[1].2), (50.0, 50.0));

    // Leftover 100pt distributes per justifyContent.
    let centered = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"25%\", 50], justifyContent: center }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let r = rects(&centered);
    assert_eq!((r[0].0, r[1].0), (50.0, 100.0));
    let between = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"25%\", 50], justifyContent: space_between }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let r = rects(&between);
    assert_eq!((r[0].0, r[1].0), (0.0, 150.0));
}

#[test]
fn column_direction_fills_top_to_bottom_first() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2, direction: column }",
        FOUR_RECTS,
    );
    let r = rects(&yaml);
    // rows_count = 2: items 0,1 fill column one; 2,3 column two. Row
    // one holds items 0 (20pt) and 2 (30pt), so row two starts at 30.
    assert_eq!((r[0].0, r[0].1), (0.0, 0.0));
    assert_eq!((r[1].0, r[1].1), (0.0, 30.0));
    assert_eq!((r[2].0, r[2].1), (100.0, 0.0));
    assert_eq!((r[3].0, r[3].1), (100.0, 30.0));
}

#[test]
fn explicit_rows_split_and_grid_gap_shorthand_covers_both_axes() {
    // rows: 2 splits the definite 100pt content height evenly (gap 10):
    // 45pt rows; `gap` sets both axes unless the specific key wins.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 2, rows: 2, gap: 10 }",
        FOUR_RECTS,
    );
    let r = rects(&yaml);
    assert_eq!((r[0].0, r[0].1), (0.0, 0.0));
    assert_eq!((r[1].0, r[1].1), (105.0, 0.0));
    assert_eq!((r[2].0, r[2].1), (0.0, 55.0));
    let wins = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 2, gap: 10, columnGap: 20 }",
        FOUR_RECTS,
    );
    let r = rects(&wins);
    // columnGap 20 wins over gap for the x axis; rowGap falls back to 10.
    assert_eq!(r[1].0, 110.0);
    assert_eq!(r[2].1, 30.0);
}

#[test]
fn explicit_row_list_sizes_first_rows_and_implicit_rows_are_auto() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2, rows: [50] }",
        FOUR_RECTS,
    );
    let r = rects(&yaml);
    // Row one is a fixed 50pt track; row two is auto (tallest = 30).
    assert_eq!(r[2].1, 50.0);
    assert_eq!(r[3].1, 50.0);
}

#[test]
fn align_items_and_auto_margins_act_within_rows_and_cells() {
    let two =
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 40 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2, alignItems: center }",
        two,
    );
    let r = rects(&yaml);
    // Row height 40: the 20pt child centers at 10.
    assert_eq!((r[0].1, r[1].1), (10.0, 0.0));
    // Horizontal auto margins center a fixed-width child in its cell.
    let cell_centered = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2 }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 50, h: 10, margin: { left: auto, right: auto } }",
    );
    let r = rects(&cell_centered);
    assert_eq!(r[0].0, 25.0);
}

#[test]
fn absolute_children_escape_the_grid_and_keep_document_paint_order() {
    let mixed = "- type: rect\n  style: { borderWidth: 1 }\n  box: { x: 10, y: 70, w: 30, h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }";
    let yaml = container_body("{ x: 0, y: 0, w: 200, type: grid, columns: 2 }", mixed);
    let r = rects(&yaml);
    // Absolute child first in paint order, at its authored spot.
    assert_eq!((r[0].0, r[0].1), (10.0, 70.0));
    // Grid children tile the tracks unaffected.
    assert_eq!((r[1].0, r[2].0), (0.0, 100.0));
}

#[test]
fn text_and_nested_containers_participate_in_grid_cells() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"30%\", \"70%\"] }",
        "- type: text\n  text: aaa\n- type: container\n  box: { h: 12 }\n  items:\n    - type: rect\n      style: { borderWidth: 1 }\n      box: { x: 0, y: 0, w: \"100%\", h: 12 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "aaa").0, 0.0);
    // The nested container's rect fills the 140pt second track.
    let r = rect_shapes(&doc.pages[0])[0];
    assert_eq!((r.x, r.w), (60.0, 140.0));
}

#[test]
fn grid_ids_land_in_the_box_index_at_their_cells() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2, columnGap: 10 }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }\n- id: badge\n  type: rect\n  box: { w: \"100%\", h: 20 }",
    );
    let out = run_full(&yaml, json!({}));
    let badge = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("badge"))
        .expect("badge box");
    assert_eq!((badge.border.x, badge.border.y), (105.0, 0.0));
}

#[test]
fn hostile_track_specs_clamp_with_diagnostics() {
    // Track count over the cap clamps to 64.
    let over = container_body(
        "{ x: 0, y: 0, w: 640, type: grid, columns: 1000000 }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let (doc, diags) = run(&over, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "grid_tracks_clamped"),
        "{diags:?}"
    );
    assert_eq!(rect_shapes(&doc.pages[0])[0].w, 10.0);
    // A zero count clamps to one track.
    let zero = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 0 }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let (doc, diags) = run(&zero, json!({}));
    assert!(diags.iter().any(|d| d.code == "grid_tracks_clamped"));
    assert_eq!(rect_shapes(&doc.pages[0])[0].w, 200.0);
    // An empty track list degrades to one full-width column.
    let empty = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let (doc, diags) = run(&empty, json!({}));
    assert!(diags.iter().any(|d| d.code == "grid_tracks_clamped"));
    assert_eq!(rect_shapes(&doc.pages[0])[0].w, 200.0);
}

#[test]
fn rows_count_on_auto_height_and_cell_overflow_degrade_with_diagnostics() {
    // `rows: N` cannot split an auto-height container.
    let auto_rows = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2, rows: 2 }",
        FOUR_RECTS,
    );
    let (_, diags) = run(&auto_rows, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "percent_of_auto"),
        "{diags:?}"
    );
    // A child taller than its explicit row track warns.
    let overflow = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2, rows: [10] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 30 }",
    );
    let (_, diags) = run(&overflow, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "grid_cell_overflow"),
        "{diags:?}"
    );
    // Negative gaps clamp to 0.
    let negative = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 2, columnGap: -50 }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let r = rects(&negative);
    assert_eq!((r[0].2, r[1].0), (100.0, 100.0));
}

#[test]
fn repeat_cells_can_be_grids() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 100 }
    items:
      - type: repeat
        data: { key: cards }
        grid: { columns: 1, rows: 1 }
        cell:
          box: { type: grid, columns: 2, columnGap: 10 }
          items:
            - type: rect
              style: { borderWidth: 1 }
              box: { w: "100%", h: 20 }
            - type: rect
              style: { borderWidth: 1 }
              box: { w: "100%", h: 20 }
"#;
    let (doc, diags) = run(yaml, json!({ "cards": [{}] }));
    assert!(!diags.has_errors(), "{diags:?}");
    let r = rect_shapes(&doc.pages[0]);
    assert_eq!((r[0].x, r[0].w), (0.0, 95.0));
    assert_eq!((r[1].x, r[1].w), (105.0, 95.0));
}
