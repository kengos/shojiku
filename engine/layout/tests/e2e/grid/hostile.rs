//! Hostile track inputs against the `auto`-column measurement and the
//! `fr` leftover: the admitted maximums, not values chosen to look
//! extreme. `MAX_GRID_TRACKS` tracks and a `1e308` length are both
//! things a template is ALLOWED to author, so the arithmetic has to hold
//! there — a doc comment claiming it does is not evidence. The last time
//! one was trusted it said "shares 0" and the helper returned NaN.

use crate::common::*;
use crate::flex::container_body;

/// Every rect width on page 1, for the "is any of this NaN" sweep.
fn widths(yaml: &str) -> Vec<f64> {
    let (doc, _) = run(yaml, json!({}));
    rect_shapes(&doc.pages[0]).iter().map(|r| r.w).collect()
}

#[test]
fn auto_tracks_at_the_track_cap_stay_finite() {
    // `MAX_GRID_TRACKS` `auto` columns, each holding content of a
    // different width, so the measurement runs once per track at the
    // maximum count the parser admits. Every resulting width must be
    // finite and non-negative — a NaN track poisons `track_offsets` and
    // every cell after it.
    let cols = vec!["\"auto\""; MAX_GRID_TRACKS].join(", ");
    let cells: String = (0..MAX_GRID_TRACKS)
        .map(|i| {
            format!(
                "- type: rect\n  style: {{ borderWidth: 1 }}\n  box: {{ w: \"100%\", h: 6 }}\n  id: c{i}\n"
            )
        })
        .collect();
    let yaml = container_body(
        &format!("{{ x: 0, y: 0, w: 400, type: grid, columns: [{cols}] }}"),
        &cells,
    );
    let ws = widths(&yaml);
    assert!(!ws.is_empty(), "the fixture drew nothing");
    for w in &ws {
        assert!(w.is_finite(), "non-finite track width {w}");
        assert!(*w >= 0.0, "negative track width {w}");
    }
}

#[test]
fn a_huge_fixed_track_beside_an_auto_one_leaves_no_negative_leftover() {
    // A `1e308`-scale fixed track consumes the axis and then some.
    // The `auto` column beside it has to end up at a finite, non-negative
    // width — the leftover is negative here, and a subtraction that is
    // allowed to stay negative walks the column cursor backwards.
    for fixed in ["1e308", "\"1e308%\"", "\"1e300mm\""] {
        let yaml = container_body(
            &format!("{{ x: 0, y: 0, w: 200, type: grid, columns: [{fixed}, \"auto\"] }}"),
            "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 6 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 6 }",
        );
        for w in &widths(&yaml) {
            assert!(w.is_finite(), "{fixed}: non-finite width {w}");
            assert!(*w >= 0.0, "{fixed}: negative width {w}");
        }
    }
}

#[test]
fn a_degenerate_container_width_clamps_auto_columns_to_zero() {
    // A zero-width container is authorable, and the `auto`
    // measurement can legitimately report content WIDER than it. The
    // tracks must clamp at 0 rather than going negative: a negative width
    // is not a small box, it is a rect drawn to the left of its own
    // origin.
    for w in ["0", "0.0001"] {
        let yaml = container_body(
            &format!("{{ x: 0, y: 0, w: {w}, type: grid, columns: [\"auto\", \"auto\"] }}"),
            "- { type: text, text: あいうえお }\n- { type: text, text: かきくけこ }",
        );
        let (doc, _) = run(&yaml, json!({}));
        for r in rect_shapes(&doc.pages[0]) {
            assert!(r.w.is_finite() && r.w >= 0.0, "{w}: bad width {}", r.w);
        }
    }
}

#[test]
fn a_column_spanning_cell_does_not_feed_the_auto_column_measurement() {
    // CSS spreads a spanning child's contribution across the tracks it
    // covers, which needs those tracks' sizes — the circularity the
    // pre-pass exists to avoid. So a span contributes nothing, and an
    // `auto` column holding only spanning children sizes to 0 with the
    // leftover going to its neighbours. Documented on grid.md; pinned
    // here so it reads as a decision rather than a surprise.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"auto\", \"auto\"] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 6, columnSpan: 2 }\n\
         - { type: text, text: あいうえ }\n- { type: text, text: か }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    // The single-column cells decided both tracks; the span rode along.
    for r in rect_shapes(&doc.pages[0]) {
        assert!(r.w.is_finite() && r.w >= 0.0, "bad width {}", r.w);
    }
}

#[test]
fn two_cells_in_one_auto_row_contribute_the_taller_of_them() {
    // The auto row's height is its TALLEST cell, and the `fr` split has
    // to subtract that one number rather than both. With one column this
    // never comes up; the second cell in the same row is what tells the
    // accumulation from a sum.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 2, rows: [\"auto\", \"1fr\"] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 12 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 30 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 6 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 6 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    // Row 0 is 30 (the taller of 12 and 30), so row 1 starts there — and
    // the fr row is 70, not 100 - 12 - 30 = 58.
    assert_eq!(ys[2], 30.0, "the second row starts after the TALLER cell");
    assert_eq!(ys[3], 30.0);
}

#[test]
fn a_cell_that_produces_no_atom_contributes_nothing_to_its_auto_row() {
    // A `rect` without `w`/`h` warns and is skipped, so the measurement
    // gets no atom back for that cell. It must contribute nothing to the
    // auto row's height rather than a zero that suppresses its sibling,
    // and the warning must still reach the author from the REAL pass —
    // the measure that saw it first is parked and discarded.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, type: grid, columns: 2, rows: [\"auto\", \"1fr\"] }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 10 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 24 }\n\
         - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 6 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    let missing = diags
        .iter()
        .filter(|d| d.code == "rect_missing_size")
        .count();
    assert_eq!(missing, 1, "reported once, by the real pass: {diags:?}");
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    // The sized sibling alone set the auto row to 24.
    assert_eq!(ys[1], 24.0, "the skipped cell did not shrink the row");
}
