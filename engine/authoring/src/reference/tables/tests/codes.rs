//! Diagnostics tables: the rows name codes, and the registry says which are
//! real — plus the half nothing checked before this change, that every code
//! the engine can emit is documented somewhere.

use crate::reference::tables::{audit, parse, render, Problem};
use std::collections::{BTreeMap, BTreeSet};

fn problems(yaml: &str) -> Vec<Problem> {
    audit(
        &super::catalog(),
        &parse(yaml).expect("the fixture parses"),
        &super::codes(),
    )
}

#[test]
fn the_baseline_documents_every_registry_code() {
    assert_eq!(problems(super::diagnostics_yaml()), vec![]);
}

#[test]
fn a_registry_code_no_table_documents_is_named() {
    // The rule that did not exist before: `diagnostics.md` was complete
    // against the enum only by diligence, and a code added to the registry
    // shipped undocumented in silence.
    let yaml = super::diagnostics_yaml()
        .replace(r#"keys: ["bad_size", "no_root"]"#, r#"keys: ["bad_size"]"#);
    assert_eq!(
        problems(&yaml),
        vec![Problem::UndocumentedCode {
            code: "no_root".to_owned()
        }]
    );
}

#[test]
fn a_row_naming_a_code_the_registry_lost_is_named() {
    let yaml = super::diagnostics_yaml().replace(r#""no_root""#, r#""retired_code""#);
    let found = problems(&yaml);
    assert!(found.contains(&Problem::UnknownCode {
        id: "diagnostics#assets".to_owned(),
        code: "retired_code".to_owned(),
    }));
    assert!(found.contains(&Problem::UndocumentedCode {
        code: "no_root".to_owned()
    }));
}

#[test]
fn a_code_documented_in_two_rows_is_not_a_duplicate() {
    // `not_an_array` and `container_depth_exceeded` are each raised at
    // validate time and again at layout time, and the two sections say
    // different, context-specific things. An "exactly once" rule would have
    // reported both as duplicates and forced a wrong edit.
    let yaml = super::diagnostics_yaml().to_owned()
        + r#"
"diagnostics#layout":
  page: diagnostics
  source: diagnostics
  columns:
    - header: "Code"
      from: key
    - header: "Meaning"
      from: authored
  rows:
    - keys: ["no_root"]
      cells:
        "Meaning": "and again, at layout time"
      reason: "the same code, said differently for this stage"
"#;
    assert_eq!(
        problems(&yaml),
        vec![],
        "a second row for one code is legitimate"
    );
}

#[test]
fn a_diagnostics_table_needs_no_node() {
    // `node:` addresses the wire catalog, which a code table has nothing to
    // do with. A catalog table without one is the error; this is not.
    assert!(!problems(super::diagnostics_yaml())
        .iter()
        .any(|p| matches!(p, Problem::NoNode { .. })));
}

#[test]
fn a_catalog_table_with_no_node_is_named() {
    let yaml = "t:\n  page: p\n  columns: []\n  rows: []\n";
    assert_eq!(
        audit(
            &super::catalog(),
            &parse(yaml).expect("parses"),
            &BTreeSet::new()
        ),
        vec![Problem::NoNode { id: "t".to_owned() }]
    );
}

#[test]
fn the_severity_column_comes_from_the_registry_not_the_prose() {
    // The mutation this test exists for: the row's own prose claims the
    // OPPOSITE severity, and the rendered cell must still be the registry's.
    // "it reads `severity()`" is an argument, not this test.
    let spec = parse(super::diagnostics_yaml()).expect("parses");
    let mut table = spec["diagnostics#assets"].clone();
    table.rows[0]
        .cells
        .insert("Meaning".to_owned(), "claims to be an error".to_owned());
    let out = render("diagnostics#assets", &table, &super::registry()).expect("renders");
    assert!(
        out.contains("| warning |"),
        "the registry's severity won: {out}"
    );
    assert!(
        !out.contains("| error |"),
        "the prose's claim did not: {out}"
    );
}

#[test]
fn a_grouped_code_row_names_every_code_it_covers() {
    let spec = parse(super::diagnostics_yaml()).expect("parses");
    let out = render(
        "diagnostics#assets",
        &spec["diagnostics#assets"],
        &super::registry(),
    )
    .expect("renders");
    assert!(out.contains("`bad_size` / `no_root`"), "{out}");
}

#[test]
fn a_severity_cell_for_a_code_the_registry_lost_is_reported() {
    let spec = parse(super::diagnostics_yaml()).expect("parses");
    let out = render(
        "diagnostics#assets",
        &spec["diagnostics#assets"],
        &BTreeMap::new(),
    );
    assert!(out.is_err(), "an empty registry can fill no severity cell");
}
