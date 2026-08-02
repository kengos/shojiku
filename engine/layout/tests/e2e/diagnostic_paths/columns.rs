//! A table cell names its COLUMN. The three passes over a row each raise
//! their own diagnostics — the binding resolve while cells are prepared,
//! the auto-height measurement, and the drawing pass — so there is one
//! case per pass; a cell authored on a header group instead of a column
//! names `headerGroups[n]` and is covered in `table/span.rs`.

use super::{by_code, only};
use crate::common::*;

/// A three-column table over `rows`, with `extra` YAML spliced at the
/// table level (row height, header, styles).
fn table(extra: &str, columns: &str, rows: Value) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
defaults: {{ style: {{ fontFamily: biz-ud-gothic, fontSize: 10 }} }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
      - type: table
        data: {{ key: rows }}
{extra}        columns:
{columns}
"#
        ),
        json!({ "rows": rows }),
    )
}

#[test]
fn a_columns_missing_binding_names_that_column() {
    // Raised while the row's cells are PREPARED (the binding resolves
    // there, before any measuring or drawing).
    let (_, diags) = table(
        "",
        concat!(
            "          - { label: A, data: { key: a }, width: 100 }\n",
            "          - { label: B, data: { key: absent }, width: 100 }\n",
        ),
        json!([{ "a": "x" }]),
    );
    let missing = only(&diags, "missing_data");
    assert_eq!(
        missing.path.as_deref(),
        Some("sections.body.items[0].columns[1]")
    );
    assert!(missing.message.contains("absent"), "{missing:?}");
}

#[test]
fn a_columns_font_guard_names_that_column_while_measuring() {
    // No `row.height`, so the row is AUTO and its height comes from
    // `measure_row` — which resolves each cell's font chain, and is
    // therefore where an unknown family is first reported.
    let (_, diags) = table(
        "",
        concat!(
            "          - { label: A, data: { key: a }, width: 100 }\n",
            "          - { label: B, data: { key: b }, width: 100, style: { fontFamily: no-such-family } }\n",
        ),
        json!([{ "a": "x", "b": "y" }]),
    );
    assert_eq!(
        only(&diags, "unknown_font_family").path.as_deref(),
        Some("sections.body.items[0].columns[1]")
    );
}

#[test]
fn two_overflowing_columns_report_separately_at_their_own_paths() {
    // Raised by the DRAWING pass. Both cells overflow the fixed row by the
    // same amount, so their messages are identical — before the column
    // segment existed, `dedup` collapsed them into one warning naming only
    // the table.
    let (_, diags) = table(
        "        row: { height: 12 }\n",
        concat!(
            "          - { label: A, data: { key: a }, width: 60 }\n",
            "          - { label: B, data: { key: b }, width: 60 }\n",
        ),
        json!([{ "a": "この文章は行に収まらない", "b": "この文章も行に収まらない" }]),
    );
    let overflows = by_code(&diags, "text_overflow");
    let paths: Vec<_> = overflows.iter().map(|d| d.path.as_deref()).collect();
    assert_eq!(
        paths,
        vec![
            Some("sections.body.items[0].columns[0]"),
            Some("sections.body.items[0].columns[1]")
        ],
        "{diags:?}"
    );
    assert_eq!(overflows[0].message, overflows[1].message);
}

#[test]
fn a_non_text_cells_asset_problem_names_its_column() {
    // The image arm of the drawing pass: an unloaded per-row asset.
    let (_, diags) = table(
        "        row: { height: 20 }\n",
        concat!(
            "          - { label: A, data: { key: a }, width: 100 }\n",
            "          - { label: B, type: image, data: { key: logo }, width: 100 }\n",
        ),
        json!([{ "a": "x", "logo": "missing.png" }]),
    );
    assert_eq!(
        only(&diags, "missing_asset").path.as_deref(),
        Some("sections.body.items[0].columns[1]")
    );
}

#[test]
fn a_cell_columns_child_keeps_its_existing_address() {
    // The `cell:` arm already carried the column segment; this pins that
    // consolidating the segment into the row passes left the total path
    // (and so the box index, which builds from the same stack) unchanged.
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: rows }
        row: { minHeight: 20 }
        columns:
          - width: 200
            cell:
              items:
                - { type: rect, box: { w: 50 } }
"#,
        json!({ "rows": [{}] }),
    );
    let path = "sections.body.items[0].columns[0].cell.items[0]";
    assert_eq!(
        out.diagnostics
            .iter()
            .find(|d| d.code == "rect_missing_size")
            .and_then(|d| d.path.as_deref()),
        Some(path),
        "{:?}",
        out.diagnostics
    );
    // The box index agrees, cell included — one address per template node.
    let boxes: Vec<&str> = out.boxes.pages[0].iter().map(|b| b.path.as_str()).collect();
    assert!(
        boxes.contains(&"sections.body.items[0].columns[0].cell"),
        "{boxes:?}"
    );
}

#[test]
fn a_qr_cells_content_problem_names_its_column() {
    // The qr arm of the drawing pass, beside the image one above: an
    // over-long payload is refused per cell.
    let long = "x".repeat(3000);
    let (_, diags) = table(
        "        row: { height: 40 }\n",
        concat!(
            "          - { label: A, data: { key: a }, width: 100 }\n",
            "          - { label: QR, type: qr_code, data: { key: token }, width: 60 }\n",
        ),
        json!([{ "a": "x", "token": long }]),
    );
    assert_eq!(
        only(&diags, "qr_content_too_long").path.as_deref(),
        Some("sections.body.items[0].columns[1]")
    );
}

#[test]
fn a_negative_column_width_names_the_column_that_authored_it() {
    // Column geometry is resolved once per table, before any row — the
    // per-column diagnostic still belongs to its own column.
    let (_, diags) = table(
        "",
        concat!(
            "          - { label: A, data: { key: a }, width: 100 }\n",
            "          - { label: B, data: { key: b }, width: -5 }\n",
        ),
        json!([{ "a": "x", "b": "y" }]),
    );
    assert_eq!(
        only(&diags, "invalid_column_width").path.as_deref(),
        Some("sections.body.items[0].columns[1]")
    );
}

#[test]
fn a_header_valign_survives_an_over_cap_style_name_list() {
    // `label_valign` folds the named-style layers under the same
    // `MAX_STYLE_NAMES` take as the rest of the cascade: an over-cap list
    // resolves (only the first 16 count) rather than panicking or hanging.
    let names: String = (0..40).map(|i| format!("s{i}, ")).collect();
    let styles: String = (0..40)
        .map(|i| format!("  s{i}: {{ verticalAlign: top }}\n"))
        .collect();
    let (doc, diags) = run(
        &format!(
            r#"
page: {{ margin: 0 }}
defaults: {{ style: {{ fontFamily: biz-ud-gothic, fontSize: 10 }} }}
styles:
{styles}sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
      - type: table
        data: {{ key: rows }}
        header: {{ height: 40, styleNames: [ {names}s0 ] }}
        row: {{ height: 40 }}
        columns:
          - {{ label: ラベル, data: {{ key: a }}, width: 100 }}
"#
        ),
        json!({ "rows": [{ "a": "x" }] }),
    );
    assert!(
        diags
            .iter()
            .all(|d| d.code != "too_many_style_names" || d.path.is_some()),
        "{diags:?}"
    );
    // The capped fold still resolved `top`: the label sits at the padding.
    assert_eq!(cell_pos(&doc.pages[0], "ラベル").1, 4.0);
}
