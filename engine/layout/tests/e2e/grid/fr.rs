//! Grid `fr` track weights: leftover distribution across columns and
//! rows (the `flexGrow` machinery), the fixed+fr mix, over-full and
//! all-zero degradations, and the `fr`-rows-need-a-definite-height
//! diagnostic.

use crate::common::*;
use crate::flex::container_body;

use super::rects;

/// A one-column grid stacking N full-cell rects, so each rect's y is its
/// row start — the probe for row-track heights.
fn row_ys(container_box: &str, n: usize) -> Vec<f64> {
    let children: String = (0..n)
        .map(|_| {
            "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }".to_string()
        })
        .collect::<Vec<_>>()
        .join("\n");
    let yaml = container_body(container_box, &children);
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect()
}

const TWO_CELLS: &str = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }";

#[test]
fn fr_columns_split_the_leftover_by_weight() {
    // 210pt over 1fr:2fr, no gap → 70 / 140.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 210, type: grid, columns: [\"1fr\", \"2fr\"] }",
        TWO_CELLS,
    );
    let r = rects(&yaml);
    assert_eq!((r[0].0, r[0].2), (0.0, 70.0));
    assert_eq!((r[1].0, r[1].2), (70.0, 140.0));
}

#[test]
fn fr_columns_take_the_leftover_after_fixed_tracks_and_gaps() {
    // [100, 1fr] over 200, no gap → fixed 100, fr takes 100.
    let fixed = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [100, \"1fr\"] }",
        TWO_CELLS,
    );
    let r = rects(&fixed);
    assert_eq!((r[0].0, r[0].2), (0.0, 100.0));
    assert_eq!((r[1].0, r[1].2), (100.0, 100.0));

    // [1fr, 1fr] over 200 with columnGap 20 → leftover 180, 90 each.
    let gapped = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"1fr\", \"1fr\"], columnGap: 20 }",
        TWO_CELLS,
    );
    let r = rects(&gapped);
    assert_eq!((r[0].0, r[0].2), (0.0, 90.0));
    assert_eq!((r[1].0, r[1].2), (110.0, 90.0));
}

#[test]
fn over_full_fixed_tracks_collapse_fr_columns_to_zero() {
    // Fixed 300 already exceeds the 200 axis → fr leftover is negative
    // and clamps to 0 (CSS: fr collapses when there is no free space).
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [300, \"1fr\"] }",
        TWO_CELLS,
    );
    let r = rects(&yaml);
    assert_eq!(r[0].2, 300.0);
    assert_eq!(r[1].2, 0.0);
}

#[test]
fn all_zero_fr_weights_degrade_to_an_equal_split() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"0fr\", \"0fr\"] }",
        TWO_CELLS,
    );
    let r = rects(&yaml);
    assert_eq!((r[0].2, r[1].2), (100.0, 100.0));
}

#[test]
fn fr_rows_split_a_definite_height_by_weight() {
    // h 100, rows 1fr:1fr, no gap → 50 / 50; the second rect starts at 50.
    let ys = row_ys(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 1, rows: [\"1fr\", \"1fr\"] }",
        2,
    );
    assert_eq!(ys, vec![0.0, 50.0]);
}

#[test]
fn fr_rows_take_the_leftover_after_fixed_rows() {
    // h 100, rows [30, 1fr] → row 0 = 30, row 1 = 70; second rect at 30.
    let ys = row_ys(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 1, rows: [30, \"1fr\"] }",
        2,
    );
    assert_eq!(ys, vec![0.0, 30.0]);
}

#[test]
fn fr_rows_on_an_auto_height_container_degrade_to_auto_with_a_diagnostic() {
    let children = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: 1, rows: [\"1fr\", \"1fr\"] }",
        children,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "grid_fr_no_basis"),
        "{diags:?}"
    );
    // Rows fell back to content height (20pt each), not a leftover split.
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(ys, vec![0.0, 20.0]);
}

#[test]
fn huge_fr_weights_degrade_without_panicking() {
    // A single near-`f64::MAX` weight: the sole track still takes the
    // whole leftover — a finite 200pt, never inf (`grow_shares`'s
    // ratio-first fallback; its unit tests pin the raw shares).
    let single = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"1e308fr\"] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }",
    );
    let r = rects(&single);
    assert_eq!((r[0].0, r[0].2), (0.0, 200.0));

    // Two huge weights sum past f64 range; both shares collapse to a
    // finite 0 (never NaN), so the 0-width rects are skipped — no panic,
    // no error, one page.
    let pair = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"1e308fr\", \"1e308fr\"] }",
        "- { type: text, text: a }\n- { type: text, text: b }",
    );
    let (doc, diags) = run(&pair, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    assert_eq!(doc.pages.len(), 1);
}

#[test]
fn fr_rows_subtract_fixed_rows_and_gaps_before_splitting() {
    // h 100, rowGap 10, rows [30, 1fr, 1fr] → leftover = 100 − 30 − 2×10
    // = 50, split 25/25; row starts land at 0, 30+10, 40+25+10.
    let ys = row_ys(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 1, rowGap: 10, \
         rows: [30, \"1fr\", \"1fr\"] }",
        3,
    );
    assert_eq!(ys, vec![0.0, 40.0, 75.0]);
}

#[test]
fn fr_entries_count_toward_the_track_clamp() {
    // 100 `fr` tracks clamp to MAX_GRID_TRACKS (64) like any track list —
    // a hostile count cannot drive allocation just by spelling `fr`.
    let cols = vec!["\"1fr\""; 100].join(", ");
    let yaml = container_body(
        &format!("{{ x: 0, y: 0, w: 200, type: grid, columns: [{cols}] }}"),
        "- { type: text, text: a }",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "grid_tracks_clamped"),
        "{diags:?}"
    );
}

#[test]
fn a_child_taller_than_its_fr_row_warns_grid_cell_overflow() {
    // h 40, one 1fr row → 40pt; a 60pt child overflows it.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 40, type: grid, columns: 1, rows: [\"1fr\"] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 60 }",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "grid_cell_overflow"),
        "{diags:?}"
    );
}

#[test]
fn fr_rows_subtract_the_measured_height_of_an_auto_row() {
    // T20. h 100, rows ["auto", "1fr"]: the auto row is as tall as its
    // 30pt child, so the `fr` row is the remaining 70 — not the whole
    // 100 it used to take, when the split could only subtract the FIXED
    // rows and an auto row counted as nothing.
    //
    // Asserted on the row's SIZE, via what fits in it. The row STARTS
    // did not move: the auto row was always folded to its tallest child
    // afterwards, so `track_offsets` put the `fr` row at 30 either way,
    // and a test reading y offsets would have passed before this existed.
    // What was wrong is that the two rows then claimed 130pt of a 100pt
    // grid.
    let overflows = |h: f64| {
        let children = format!(
            "- type: rect\n  style: {{ borderWidth: 1 }}\n  box: {{ w: \"100%\", h: 30 }}\n\
             - type: rect\n  style: {{ borderWidth: 1 }}\n  box: {{ w: \"100%\", h: {h} }}"
        );
        let yaml = container_body(
            "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 1, rows: [\"auto\", \"1fr\"] }",
            &children,
        );
        let (_, diags) = run(&yaml, json!({}));
        let hit = diags.iter().any(|d| d.code == "grid_cell_overflow");
        hit
    };
    assert!(
        !overflows(70.0),
        "70pt fits the corrected fr row (100 - 30)"
    );
    assert!(
        overflows(71.0),
        "71pt does not — the row is 70, not the whole 100"
    );
}

#[test]
fn an_auto_row_measured_for_the_fr_split_reports_its_content_once() {
    // The measurement is a THROWAWAY placement, so anything it says must
    // stay parked: the auto row here holds a child that warns, and the
    // author must see that warning exactly once, from the real pass.
    let children = "- type: text\n  box: { h: 8 }\n  text: a line long enough to want more room than it is given\n\
                    - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 10 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 1, rows: [\"auto\", \"1fr\"] }",
        children,
    );
    let (_, diags) = run(&yaml, json!({}));
    let overflows = diags.iter().filter(|d| d.code == "text_overflow").count();
    assert_eq!(overflows, 1, "measured once, reported once: {diags:?}");
}

#[test]
fn a_row_spanning_child_does_not_feed_the_fr_split() {
    // The documented residual. A child spanning the auto row and the `fr`
    // row pours its overflow into its LAST spanned row only once the rows
    // it spans have sizes — and one of those sizes is what the split is
    // computing. So the span contributes nothing here and the `fr` row
    // takes the leftover after the SINGLE-row cells alone. Pinned so the
    // limitation is a decision, not a surprise.
    let children = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 30 }\n\
                    - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 20, rowSpan: 2 }";
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 1, rows: [\"auto\", \"1fr\", \"1fr\"] }",
        children,
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    // Auto row = 30 (its own single-row child); the two fr rows split the
    // remaining 70. The spanning child starts at the second row.
    assert_eq!(ys[0], 0.0);
    assert_eq!(ys[1], 30.0);
}
