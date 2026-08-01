//! `cell:` column checks: the `data`×`cell` content shape, and the
//! row-scoped bindings inside a cell's sub-template.

use super::*;
use shojiku_diagnostics::Severity;

/// A one-column table whose column is `column_yaml` (already indented to
/// the `columns:` list level).
fn column_table(column_yaml: &str) -> Template {
    tpl(&format!(
        "      - type: table\n        data: {{ key: order_items }}\n        columns:\n{column_yaml}"
    ))
}

/// Wraps `yaml` in `depth` nested containers. Indents line by line: a
/// substring replace would also hit the deeper levels' whitespace and
/// corrupt the document.
fn nest_in_containers(yaml: &str, depth: usize) -> String {
    let mut out = yaml.to_string();
    for _ in 0..depth {
        let inner: String = out.lines().map(|l| format!("    {l}\n")).collect();
        out = format!("      - type: container\n        items:\n{inner}");
    }
    out
}

fn codes(diags: &Diagnostics) -> Vec<&str> {
    diags.iter().map(|d| d.code.as_str()).collect()
}

#[test]
fn a_cell_column_is_valid_without_data() {
    let t = column_table(
        "          - width: 100\n            cell:\n              items:\n                - { type: text, data: { key: name } }\n",
    );
    let diags = validate(Some(&defs()), &t, None);
    assert!(
        diags.iter().all(|d| d.severity != Severity::Error),
        "{:?}",
        codes(&diags)
    );
}

#[test]
fn data_and_cell_on_one_column_conflict() {
    let t = column_table(
        "          - data: { key: name }\n            cell:\n              items:\n                - { type: text, text: hi }\n",
    );
    let diags = validate(None, &t, None);
    let hit = diags
        .iter()
        .find(|d| d.code == "column_content_conflict")
        .expect("conflict");
    assert_eq!(
        hit.path.as_deref(),
        Some("sections.body.items[0].columns[0]")
    );
}

#[test]
fn the_data_only_knobs_conflict_with_a_cell_column() {
    let t = column_table(
        "          - type: image\n            fit: cover\n            cell:\n              items:\n                - { type: text, text: hi }\n",
    );
    let diags = validate(None, &t, None);
    // One per inert key, so the author sees which to delete.
    assert_eq!(
        codes(&diags)
            .iter()
            .filter(|c| **c == "column_content_conflict")
            .count(),
        2
    );
}

#[test]
fn a_column_with_neither_data_nor_cell_is_an_error() {
    let t = column_table("          - { label: 空, width: 100 }\n");
    let diags = validate(None, &t, None);
    let hit = diags
        .iter()
        .find(|d| d.code == "column_content_missing")
        .expect("missing");
    assert_eq!(
        hit.path.as_deref(),
        Some("sections.body.items[0].columns[0]")
    );
}

#[test]
fn a_column_with_neither_is_still_only_a_content_error_under_definitions() {
    // The binding walk has no key to check and must not invent one.
    let t = column_table("          - { label: 空, width: 100 }\n");
    let diags = validate(Some(&defs()), &t, None);
    assert!(codes(&diags).contains(&"column_content_missing"));
    assert!(
        !codes(&diags).contains(&"unknown_data_key"),
        "{:?}",
        codes(&diags)
    );
}

#[test]
fn a_table_nested_too_deep_caps_its_cell_columns() {
    // The cap must trip at the TABLE itself. Exactly `MAX_CONTAINER_DEPTH`
    // containers put the table one level past the cap while every
    // container above it stays legal — one more and the container arm
    // would return first, and the table's own guard would never run.
    let table = "      - type: table\n        data: { key: order_items }\n        columns:\n          - cell:\n              items:\n                - { type: text, text: hi }\n";
    let t = tpl(&nest_in_containers(table, MAX_CONTAINER_DEPTH));
    let diags = validate(None, &t, None);
    assert!(
        codes(&diags).contains(&"container_depth_exceeded"),
        "{:?}",
        codes(&diags)
    );
}

#[test]
fn a_cell_binding_outside_the_array_group_is_unknown() {
    let t = column_table(
        "          - cell:\n              items:\n                - { type: text, data: { key: nope } }\n",
    );
    let diags = validate(Some(&defs()), &t, None);
    let hit = diags
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("unknown key");
    assert_eq!(
        hit.path.as_deref(),
        Some("sections.body.items[0].columns[0].cell.items[0]")
    );
}

#[test]
fn a_cell_interpolation_is_checked_against_the_array_group() {
    let t = column_table(
        "          - cell:\n              items:\n                - { type: text, text: \"{name} x {nope}\" }\n",
    );
    let diags = validate(Some(&defs()), &t, None);
    assert_eq!(
        codes(&diags)
            .iter()
            .filter(|c| **c == "unknown_data_key")
            .count(),
        1,
        "only the undeclared key: {:?}",
        codes(&diags)
    );
}

#[test]
fn an_undefined_style_name_inside_a_cell_is_caught() {
    let t = column_table(
        "          - cell:\n              items:\n                - { type: text, text: hi, styleNames: [nope] }\n",
    );
    let diags = validate(None, &t, None);
    assert!(
        codes(&diags).contains(&"undefined_style_name"),
        "{:?}",
        codes(&diags)
    );
}

#[test]
fn an_image_inside_a_cell_needs_exactly_one_source() {
    let t = column_table(
        "          - cell:\n              items:\n                - { type: image, src: a.png, data: { key: name } }\n",
    );
    let diags = validate(None, &t, None);
    let hit = diags
        .iter()
        .find(|d| d.code == "image_source_conflict")
        .expect("conflict");
    assert_eq!(
        hit.path.as_deref(),
        Some("sections.body.items[0].columns[0].cell.items[0]")
    );
}

#[test]
fn a_mark_inside_a_cell_is_scoped_to_the_row() {
    // `name` is an array field, not a scalar: a row-scoped lookup finds
    // it, a document-scoped one would report it unknown.
    let t = column_table(
        "          - cell:\n              items:\n                - { type: checkbox, data: { key: name, equals: x } }\n",
    );
    let diags = validate(Some(&defs()), &t, None);
    assert!(
        !codes(&diags).contains(&"unknown_data_key"),
        "{:?}",
        codes(&diags)
    );
}

#[test]
fn containers_nested_too_deep_inside_a_cell_are_capped() {
    let mut inner = "                - { type: text, text: deep }\n".to_string();
    for _ in 0..MAX_CONTAINER_DEPTH + 2 {
        let nested: String = inner.lines().map(|l| format!("    {l}\n")).collect();
        inner = format!("                - type: container\n                  items:\n{nested}");
    }
    let t = column_table(&format!("          - cell:\n              items:\n{inner}"));
    let diags = validate(None, &t, None);
    assert!(
        codes(&diags).contains(&"container_depth_exceeded"),
        "{:?}",
        codes(&diags)
    );
}
