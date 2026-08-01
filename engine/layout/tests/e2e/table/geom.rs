//! Table geometry end to end (mirrors src `engine/table/geom.rs`):
//! Length column widths, the unsized equal share, and the guarded
//! row/header heights + cell padding.

use crate::common::*;

fn table(columns: &str, extra: &str, params: Value) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 400 }}
    items:
      - type: table
        data: {{ key: items }}
{extra}        columns:
{columns}"#
        ),
        params,
    )
}

fn one_row() -> Value {
    json!({ "items": [ { "a": "x", "b": "y", "c": "z" } ] })
}

/// Interior column separators, sorted by x.
fn separator_xs(page: &LayoutPage) -> Vec<f64> {
    let mut xs: Vec<f64> = line_shapes(page).iter().map(|l| l.x1).collect();
    xs.sort_by(f64::total_cmp);
    xs
}

#[test]
fn percent_and_physical_widths_resolve_against_the_region() {
    let (doc, diags) = table(
        "          - { data: { key: a }, width: \"40%\" }\n          - { data: { key: b }, width: \"20mm\" }\n          - { data: { key: c }, width: 100 }\n",
        "",
        one_row(),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    // 40% of 500 = 200; 20mm = 56.69pt.
    let xs = separator_xs(&doc.pages[0]);
    assert_eq!(xs.len(), 2);
    assert!((xs[0] - 200.0).abs() < 0.01, "got {xs:?}");
    assert!((xs[1] - 256.693).abs() < 0.01, "got {xs:?}");
    // The row outline spans exactly the summed widths.
    let outline = rect_shapes(&doc.pages[0])[0];
    assert!((outline.w - 356.693).abs() < 0.01);
}

#[test]
fn unsized_columns_split_the_leftover_equally() {
    let (doc, diags) = table(
        "          - { data: { key: a }, width: 100 }\n          - { data: { key: b } }\n          - { data: { key: c } }\n",
        "",
        one_row(),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    // 500 - 100 = 400 leftover, 200 each: separators at 100 and 300.
    assert_eq!(separator_xs(&doc.pages[0]), vec![100.0, 300.0]);
}

#[test]
fn all_unsized_columns_split_the_region() {
    let (doc, diags) = table(
        "          - { data: { key: a } }\n          - { data: { key: b } }\n",
        "",
        one_row(),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    assert_eq!(separator_xs(&doc.pages[0]), vec![250.0]);
}

#[test]
fn oversized_columns_leave_nothing_for_unsized_and_warn() {
    // The sized column overfills the 500pt region: the unsized column
    // clamps to 0 and the total triggers table_too_wide.
    let (doc, diags) = table(
        "          - { data: { key: a }, width: 600 }\n          - { data: { key: b } }\n",
        "",
        one_row(),
    );
    assert!(diags.iter().any(|d| d.code == "table_too_wide"));
    assert_eq!(separator_xs(&doc.pages[0]), vec![600.0]);
}

#[test]
fn negative_column_width_clamps_to_zero_with_a_diagnostic() {
    let (_doc, diags) = table(
        "          - { data: { key: a }, width: -50 }\n          - { data: { key: b }, width: 100 }\n",
        "",
        one_row(),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_column_width"));
}

#[test]
fn width_past_the_resolve_cap_is_dropped() {
    let (_doc, diags) = table(
        "          - { data: { key: a }, width: 2000000 }\n",
        "",
        one_row(),
    );
    assert!(diags.iter().any(|d| d.code == "length_out_of_range"));
}

#[test]
fn fixed_row_height_takes_percent_of_the_region_height() {
    let (doc, diags) = table(
        "          - { data: { key: a }, width: 100 }\n",
        "        row: { height: \"10%\" }\n",
        one_row(),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    // 10% of the 400pt region: the row outline is 40pt tall.
    assert_eq!(rect_shapes(&doc.pages[0])[0].h, 40.0);
}

#[test]
fn min_height_takes_physical_units() {
    let (doc, diags) = table(
        "          - { data: { key: a }, width: 100 }\n",
        "        row: { minHeight: \"10mm\" }\n",
        one_row(),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    assert!((rect_shapes(&doc.pages[0])[0].h - 28.346).abs() < 0.01);
}

#[test]
fn negative_fixed_height_falls_back_to_auto_with_a_diagnostic() {
    let (doc, diags) = table(
        "          - { data: { key: a }, width: 100 }\n",
        "        row: { height: -10 }\n",
        one_row(),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_row_height"));
    // Auto sizing: the default 24pt minimum applies.
    assert_eq!(rect_shapes(&doc.pages[0])[0].h, 24.0);
}

#[test]
fn negative_cell_padding_clamps_to_zero_with_a_diagnostic() {
    let (doc, diags) = table(
        "          - { data: { key: a }, width: 100 }\n",
        "        cellPadding: -2\n",
        one_row(),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_cell_padding"));
    // Padding 0: the cell text starts at the cell edge.
    assert_eq!(cell_pos(&doc.pages[0], "x").0, 0.0);
}

#[test]
fn table_wider_than_flow_warns() {
    let (_doc, diags) = table(
        "          - { data: { key: a }, width: 600 }\n",
        "",
        one_row(),
    );
    assert!(diags.iter().any(|d| d.code == "table_too_wide"));
}
