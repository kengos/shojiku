//! The properties that keep the stamp safe: the number of diagnostics is
//! bounded by the TEMPLATE, never by how much data the caller sends, and
//! `path` only ever carries engine-synthesized structure.

use super::{by_code, flow_body, only};
use crate::common::*;

#[test]
fn a_per_row_warning_stays_one_diagnostic_however_many_rows_arrive() {
    // The path stack carries the COLUMN but no row index, so 500 rows
    // repeating one problem still dedup to a single warning: params length
    // cannot inflate the diagnostic list.
    let rows: Vec<Value> = (0..500)
        .map(|i| json!({ "name": format!("r{i}") }))
        .collect();
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: table\n",
            "        data: { key: rows }\n",
            "        row: { height: 12 }\n",
            "        columns:\n",
            "          - { label: 名前, data: { key: name }, width: 100 }\n",
            "          - { label: 金額, data: { key: absent }, width: 100 }\n",
        )),
        json!({ "rows": rows }),
    );
    let missing = by_code(&diags, "missing_data");
    assert_eq!(missing.len(), 1, "one per (code, path, message): {diags:?}");
    assert_eq!(
        missing[0].path.as_deref(),
        Some("sections.body.items[0].columns[1]")
    );
}

#[test]
fn a_hostile_binding_key_never_reaches_the_path() {
    // `path` is built from structure alone; the key rides in `args`,
    // where values are clipped. A long key must not become the location.
    let key = "k".repeat(10_000);
    let (_, diags) = run(
        &flow_body(&format!(
            "      - type: text\n        box: {{ w: 100, h: 20 }}\n        data: {{ key: {key} }}\n"
        )),
        json!({}),
    );
    let missing = only(&diags, "missing_data");
    assert_eq!(missing.path.as_deref(), Some("sections.body.items[0]"));
    let path = missing.path.as_deref().unwrap();
    assert!(!path.contains("kkk"), "path carried the key: {path}");
    assert!(
        path.len() < 100,
        "path length {} is not structural",
        path.len()
    );
}

#[test]
fn a_measure_pass_does_not_duplicate_or_misplace_a_cell_warning() {
    // An auto-height row lays each `cell:` column out twice (measure,
    // then draw). The measure pass is parked and discarded, so the
    // author hears the warning once, at the column's own address.
    let (_, diags) = run(
        &flow_body(concat!(
            "      - type: table\n",
            "        data: { key: rows }\n",
            "        row: { minHeight: 20 }\n",
            "        columns:\n",
            "          - width: 200\n",
            "            cell:\n",
            "              items:\n",
            "                - type: rect\n",
            "                  box: { w: 50 }\n",
        )),
        json!({ "rows": [{}] }),
    );
    assert_eq!(
        only(&diags, "rect_missing_size").path.as_deref(),
        Some("sections.body.items[0].columns[0].cell.items[0]")
    );
}
