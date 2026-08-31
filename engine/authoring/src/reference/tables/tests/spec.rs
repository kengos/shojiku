//! Parsing the spec file. Unknown keys are refused rather than ignored — a
//! typo'd column or row key would otherwise render a silently different table.

use crate::reference::tables::{parse, Cell, Coverage};

#[test]
fn parses_the_baseline() {
    let spec = parse(super::spec_yaml()).expect("the baseline parses");
    let table = &spec["box#keys"];
    assert_eq!(table.page, "box");
    assert_eq!(table.node.as_deref(), Some("Box"));
    assert_eq!(table.coverage, Coverage::Full);
    assert_eq!(table.columns.len(), 3);
    assert_eq!(table.columns[0].from, Cell::Key);
    assert_eq!(table.rows.len(), 2);
    assert_eq!(table.rows[0].keys, ["w", "h"]);
    assert_eq!(table.rows[0].label.as_deref(), Some("`w` / `h`"));
    assert!(table.rows[1].label.is_none());
}

#[test]
fn coverage_defaults_to_full() {
    // The strict answer is the default: a table that says nothing must not
    // silently opt out of the completeness rule.
    let spec = parse("t:\n  page: p\n  node: Box\n  columns: []\n  rows: []\n").expect("parses");
    assert_eq!(spec["t"].coverage, Coverage::Full);
}

#[test]
fn a_column_with_no_source_is_authored() {
    let spec = parse("t:\n  page: p\n  node: Box\n  columns: [{ header: X }]\n  rows: []\n")
        .expect("parses");
    assert_eq!(spec["t"].columns[0].from, Cell::Authored);
}

#[test]
fn an_unknown_column_source_is_refused() {
    let err = parse(
        "t:\n  page: p\n  node: Box\n  columns: [{ header: X, from: nonsense }]\n  rows: []\n",
    );
    assert!(err.is_err(), "an unknown cell source is a parse error");
}

#[test]
fn an_unknown_table_key_is_refused() {
    let err = parse("t:\n  page: p\n  node: Box\n  colums: []\n  rows: []\n");
    assert!(
        err.is_err(),
        "a misspelled `columns` is a parse error, not a default"
    );
}

#[test]
fn an_unknown_row_key_is_refused() {
    let err =
        parse("t:\n  page: p\n  node: Box\n  columns: []\n  rows: [{ keys: [w], cel: {} }]\n");
    assert!(err.is_err(), "a misspelled `cells` is a parse error");
}

#[test]
fn a_missing_required_field_is_refused() {
    // `node` is OPTIONAL — a diagnostics table has none — so `page` is the
    // required one this asserts. Refusing a CATALOG table with no node is a
    // RULE rather than a shape, and lives in the audit.
    assert!(
        parse("t:\n  node: Box\n  columns: []\n  rows: []\n").is_err(),
        "`page` is required"
    );
}
