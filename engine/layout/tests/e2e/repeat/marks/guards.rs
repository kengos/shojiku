//! Cut marks against the sheets that could break them: a cap-clamped
//! grid, asymmetric page margins, and a run that hits the page cap.

use crate::common::*;

fn elements(n: usize) -> Value {
    json!({ "cells": (0..n).map(|i| json!({ "label": i.to_string() })).collect::<Vec<_>>() })
}

#[test]
fn the_marks_follow_the_clamped_grid_not_the_authored_one() {
    // 100×100 is far over `MAX_IMPOSITION_PER_PAGE`; the grid clamps to
    // 64×1 and the ticks must describe THAT, not the authored numbers
    // (which would be 202 + 202 segments).
    let (doc, diags) = run(
        r#"
page: { size: A4, margin: 25 }
sections:
  body:
    type: flow
    items:
      - type: repeat
        data: { key: cells }
        cutMarks: true
        grid: { columns: 100, rows: 100 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 6, lineHeight: 1.0 }
"#,
        elements(4),
    );
    assert!(
        diags
            .items
            .iter()
            .any(|d| d.code.as_str() == "imposition_grid_clamped"),
        "{diags:?}"
    );
    // 65 vertical cuts × 2 ends + 2 horizontal cuts × 2 ends.
    assert_eq!(line_shapes(&doc.pages[0]).len(), 2 * 65 + 2 * 2);
}

#[test]
fn each_side_clamps_its_ticks_to_its_own_margin() {
    // A wide left margin, a hairline right one, no top margin: the left
    // ticks are full length, the right ones are shortened to the room
    // there, and the top ones are dropped with the diagnostic.
    let (doc, diags) = run(
        r#"
page: { size: A4, margin: { top: 0, right: 2, bottom: 40, left: 40 } }
sections:
  body:
    type: flow
    items:
      - type: repeat
        data: { key: cells }
        cutMarks: true
        grid: { columns: 1, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        elements(2),
    );
    let clipped: Vec<_> = diags
        .items
        .iter()
        .filter(|d| d.code.as_str() == "cut_marks_clipped")
        .collect();
    assert_eq!(clipped.len(), 1, "{diags:?}");
    assert!(
        clipped[0].message.contains("top"),
        "{:?}",
        clipped[0].message
    );
    assert!(
        !clipped[0].message.contains("left"),
        "{:?}",
        clipped[0].message
    );

    let lines = line_shapes(&doc.pages[0]);
    // Left ticks: the full 6pt, from the region's left edge (x = 40).
    let left: Vec<_> = lines
        .iter()
        .filter(|l| l.y1 == l.y2 && l.x2 < l.x1)
        .collect();
    assert_eq!(left.len(), 3);
    assert!(
        left.iter().all(|l| (l.x1 - l.x2 - 6.0).abs() < 0.01),
        "{left:?}"
    );
    // Right ticks: clamped to the 2pt margin there.
    let right: Vec<_> = lines
        .iter()
        .filter(|l| l.y1 == l.y2 && l.x2 > l.x1)
        .collect();
    assert_eq!(right.len(), 3);
    assert!(
        right.iter().all(|l| (l.x2 - l.x1 - 2.0).abs() < 0.01),
        "{right:?}"
    );
    // No tick reaches up out of the grid (the top margin is zero).
    assert!(!lines.iter().any(|l| l.x1 == l.x2 && l.y2 < l.y1));
}

#[test]
fn a_run_that_hits_the_page_cap_still_marks_only_real_pages() {
    // One cell per page over the 500-page cap: the marks walk must stop
    // with the pages that exist rather than index past them.
    let (doc, diags) = run(
        r#"
page: { size: A4, margin: 25 }
sections:
  body:
    type: flow
    items:
      - type: repeat
        data: { key: cells }
        cutMarks: true
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        elements(MAX_PAGES + 5),
    );
    assert!(
        diags
            .items
            .iter()
            .any(|d| d.code.as_str() == "page_overflow"),
        "{diags:?}"
    );
    assert_eq!(doc.pages.len(), MAX_PAGES);
    // Every page that exists is marked (4 cuts × 2 ends on a 1×1 grid).
    assert!(doc
        .pages
        .iter()
        .all(|page| line_shapes(page).len() == 2 * 2 + 2 * 2));
}
