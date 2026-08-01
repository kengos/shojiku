//! Cut marks end to end (mirrors src `engine/repeat/marks.rs`): which
//! pages get ticks, where they sit relative to the grid, and what a sheet
//! with no room reports.

use crate::common::*;

/// Four cells on an A4 page with a 25pt margin, cut marks on.
fn sheet(spec: &str, cells: usize) -> (LayoutDocument, Diagnostics) {
    let elements: Vec<Value> = (0..cells)
        .map(|i| json!({ "label": i.to_string() }))
        .collect();
    run(
        &format!(
            r#"
page: {{ size: A4, margin: 25 }}
sections:
  body:
    type: flow
    items:
      - type: repeat
        data: {{ key: cells }}
        cutMarks: true
        {spec}
        cell:
          items:
            - type: text
              box: {{ x: 0, y: 0 }}
              data: {{ key: label }}
              style: {{ fontSize: 10, lineHeight: 1.0 }}
"#
        ),
        json!({ "cells": elements }),
    )
}

/// The ticks reaching left out of the grid, by their y (the horizontal
/// cut positions).
fn left_tick_ys(page: &LayoutPage) -> Vec<f64> {
    let mut ys: Vec<f64> = line_shapes(page)
        .into_iter()
        .filter(|l| l.y1 == l.y2 && l.x2 < l.x1)
        .map(|l| l.y1)
        .collect();
    ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
    ys
}

#[test]
fn no_marks_are_drawn_unless_the_key_is_set() {
    let (doc, diags) = run(
        r#"
page: { size: A4, margin: 25 }
sections:
  body:
    type: flow
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
"#,
        json!({ "cells": [{"label": "A"}] }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert!(line_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn a_two_by_two_grid_gets_a_tick_pair_per_cut() {
    let (doc, diags) = sheet("grid: { columns: 2, rows: 2, gap: 12 }", 4);
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // 3 vertical cuts + 3 horizontal cuts, two ticks each.
    assert_eq!(line_shapes(&doc.pages[0]).len(), 12);
}

#[test]
fn the_ticks_sit_outside_the_grid_and_never_cross_a_cell() {
    let (doc, _) = sheet("grid: { columns: 2, rows: 2, gap: 12 }", 4);
    let page = &doc.pages[0];
    // The grid spans the margin box: x 25..570.28, y 25..816.89 on A4.
    for line in line_shapes(page) {
        let horizontal = line.y1 == line.y2;
        if horizontal {
            // A left/right tick stays outside the region's x range.
            assert!(
                line.x1.min(line.x2) < 25.0 || line.x1.max(line.x2) > 570.28,
                "tick inside the grid: {line:?}"
            );
        } else {
            assert!(
                line.y1.min(line.y2) < 25.0 || line.y1.max(line.y2) > 816.88,
                "tick inside the grid: {line:?}"
            );
        }
    }
}

#[test]
fn the_cut_positions_are_the_edges_and_the_gap_centres() {
    let (doc, _) = sheet("grid: { columns: 1, rows: 2, gap: 40 }", 2);
    // Region height 841.89 − 50 = 791.89; two rows with a 40pt gap →
    // 375.945pt slots. Cuts at the top edge, the gap centre, the bottom.
    let ys = left_tick_ys(&doc.pages[0]);
    assert_eq!(ys.len(), 3);
    assert!((ys[0] - 25.0).abs() < 0.01, "{ys:?}");
    assert!((ys[1] - (25.0 + 375.945 + 20.0)).abs() < 0.01, "{ys:?}");
    assert!((ys[2] - 816.89).abs() < 0.01, "{ys:?}");
}

#[test]
fn a_gapless_grid_marks_the_shared_cell_edge() {
    let (doc, _) = sheet("grid: { columns: 1, rows: 2 }", 2);
    let ys = left_tick_ys(&doc.pages[0]);
    assert_eq!(ys.len(), 3);
    // The interior cut lands exactly on the shared edge (mid-region).
    assert!((ys[1] - (25.0 + 791.89 / 2.0)).abs() < 0.01, "{ys:?}");
}

#[test]
fn every_page_the_grid_fills_gets_its_own_marks() {
    // 2×2 with five elements → two pages, both marked.
    let (doc, _) = sheet("grid: { columns: 2, rows: 2 }", 5);
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(line_shapes(&doc.pages[0]).len(), 12);
    // The last sheet is half empty but is still cut into the same pieces.
    assert_eq!(line_shapes(&doc.pages[1]).len(), 12);
}

#[test]
fn a_started_first_page_marks_only_the_rows_it_holds() {
    let (doc, _) = run(
        r#"
page: { size: A4, margin: 25 }
sections:
  body:
    type: flow
    items:
      - type: text
        text: 見出し
        style: { fontSize: 20, lineHeight: 1.0 }
      - type: repeat
        data: { key: cells }
        cutMarks: true
        breakBefore: auto
        grid: { columns: 1, rows: 4 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": (0..5).map(|i| json!({ "label": i.to_string() })).collect::<Vec<_>>() }),
    );
    // The heading costs one row on the first page (3 rows fit), so that
    // page has four horizontal cuts and the next has five.
    assert_eq!(left_tick_ys(&doc.pages[0]).len(), 4);
    assert_eq!(left_tick_ys(&doc.pages[1]).len(), 5);
}

#[test]
fn a_sheet_with_no_margin_reports_the_clipped_sides() {
    let (doc, diags) = run(
        r#"
page: { size: A4, margin: 0 }
sections:
  body:
    type: flow
    items:
      - type: repeat
        data: { key: cells }
        cutMarks: true
        grid: { columns: 2, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "A"}] }),
    );
    let clipped: Vec<_> = diags
        .items
        .iter()
        .filter(|d| d.code.as_str() == "cut_marks_clipped")
        .collect();
    assert_eq!(clipped.len(), 1, "{diags:?}");
    assert!(
        clipped[0].message.contains("top, right, bottom, left"),
        "{:?}",
        clipped[0].message
    );
    assert!(line_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn marks_are_chrome_and_never_land_in_the_box_index() {
    let out = run_full(
        r#"
page: { size: A4, margin: 25 }
sections:
  body:
    type: flow
    items:
      - type: repeat
        id: sheet
        data: { key: cells }
        cutMarks: true
        grid: { columns: 2, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "A"}] }),
    );
    // Only the repeat's own fragment and the cell's text are addressable.
    let ids: Vec<_> = out.boxes.pages[0]
        .iter()
        .filter_map(|b| b.id.as_deref())
        .collect();
    assert_eq!(ids, vec!["sheet"]);
}
