//! `grid_column_overflow`: a child wider than the column-track run it was
//! placed in spills over its neighbour. The row axis has its own
//! number-only codes (`grid_row_overflow` / `grid_span_overflow`, exercised
//! in the parent module and `spans`); no axis carries an English arg a
//! translating consumer could only pass through.

use crate::common::*;

/// A 200pt-wide grid of `columns` equal tracks holding `items`.
fn grid(columns: &str, items: &str) -> Diagnostics {
    run(
        &format!(
            "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: flow\n    items:\n      \
             - type: container\n        box: {{ w: 200, type: grid, columns: {columns} }}\n        items:\n{items}"
        ),
        json!({}),
    )
    .1
}

fn cell_overflows(diags: &Diagnostics) -> Vec<&Diagnostic> {
    diags
        .iter()
        .filter(|d| d.code == "grid_column_overflow")
        .collect()
}

#[test]
fn a_child_wider_than_its_column_track_warns() {
    // Two 100pt tracks; a 140pt child overruns the first by 40pt.
    let diags = grid(
        "2",
        "          - { type: rect, style: { borderWidth: 1 }, box: { w: 140, h: 10 } }\n",
    );
    let hits = cell_overflows(&diags);
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(arg_num(hits[0], "child"), Some(140.0));
    assert_eq!(arg_num(hits[0], "track"), Some(100.0));
    assert_eq!(arg_num(hits[0], "span"), Some(1.0));
    // Number-only payload: nothing here needs translating.
    assert!(args_all_numeric(hits[0]), "{:?}", hits[0]);
}

#[test]
fn a_child_wider_than_its_spanned_columns_names_the_span() {
    // A 2-track span is 200pt; a 240pt child still overruns it, and the
    // `extent` says which measurement it was checked against.
    let diags = grid(
        "2",
        "          - { type: rect, style: { borderWidth: 1 }, box: { w: 240, h: 10, columnSpan: 2 } }\n",
    );
    let hits = cell_overflows(&diags);
    assert_eq!(hits.len(), 1, "{diags:?}");
    // The span COUNT is the arg — a locale phrases "2 tracks" its own way.
    assert_eq!(arg_num(hits[0], "span"), Some(2.0));
    assert_eq!(arg_num(hits[0], "track"), Some(200.0));
}

#[test]
fn a_column_overflow_raises_no_row_axis_code() {
    // Each code names one axis: a child too WIDE never reports as too tall,
    // and nothing emits the deprecated `grid_cell_overflow`.
    let diags = grid(
        "2",
        "          - { type: rect, style: { borderWidth: 1 }, box: { w: 140, h: 10 } }\n",
    );
    assert!(
        diags.iter().all(|d| !matches!(
            d.code.as_str(),
            "grid_cell_overflow" | "grid_row_overflow" | "grid_span_overflow"
        )),
        "{diags:?}"
    );
}

#[test]
fn a_child_that_fills_its_track_never_warns() {
    // No authored `w`: the child fills the track and cannot overflow it.
    let diags = grid("2", "          - { type: text, text: あああああ }\n");
    assert!(cell_overflows(&diags).is_empty(), "{diags:?}");
}

#[test]
fn a_child_that_exactly_fits_its_track_never_warns() {
    let diags = grid(
        "2",
        "          - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 10 } }\n",
    );
    assert!(cell_overflows(&diags).is_empty(), "{diags:?}");
}

#[test]
fn a_child_margin_counts_toward_the_track_overflow() {
    // The border box PLUS the right margin has to fit, as everywhere else.
    let diags = grid(
        "2",
        "          - { type: rect, style: { borderWidth: 1 }, box: { w: 100, h: 10, margin: { right: 20 } } }\n",
    );
    assert_eq!(cell_overflows(&diags).len(), 1, "{diags:?}");
}

#[test]
fn the_track_warning_names_the_child_not_the_grid() {
    let diags = grid(
        "2",
        "          - { type: text, text: a }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 140, h: 10 } }\n",
    );
    let hits = cell_overflows(&diags);
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(
        hits[0].path.as_deref(),
        Some("sections.body.items[0].items[1]"),
        "{:?}",
        hits[0]
    );
}
