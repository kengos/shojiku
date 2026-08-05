//! The ARRAY a `list` binds — the SOURCE key rather than the entries:
//! row-relative inside a cell, a declared top-level source otherwise, and
//! never one silently standing in for the other.

use super::super::*;
use super::{codes, ldefs, list_over};

/// A `scope: document` list inside a `repeat` cell, bound to `key`.
fn escaped_list(key: &str) -> Template {
    tpl(&format!(
        "      - type: repeat\n        data: {{ key: orders }}\n        cell:\n          items:\n            - type: list\n              data: {{ key: {key}, scope: document }}\n"
    ))
}

#[test]
fn an_escaped_list_binds_a_declared_source_not_a_scalar_field() {
    // The regression this replaced: the escaped key went through the
    // SCALAR check, so every legal top-level ARRAY was reported as
    // undeclared. Each arm is named by the code it must produce.
    let ok = validate(Some(&ldefs()), &escaped_list("releases"), None);
    assert!(
        codes(&ok, "unknown_data_key").is_empty() && codes(&ok, "not_an_array").is_empty(),
        "a declared array is a legal escaped source: {:?}",
        ok.iter().map(|d| d.code).collect::<Vec<_>>()
    );

    let unknown = validate(Some(&ldefs()), &escaped_list("nope"), None);
    let d = unknown
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("an undeclared escaped source");
    assert!(d.message.contains("nope"));
    assert!(d.message.contains("definitions"));
    assert_eq!(
        d.path.as_deref(),
        Some("sections.body.items[0].cell.items[0]")
    );

    let scalar = validate(Some(&ldefs()), &escaped_list("venue"), None);
    assert!(
        scalar.iter().any(|d| d.code == "not_an_array"),
        "a declared SCALAR is a different mistake from an undeclared key: {:?}",
        scalar.iter().map(|d| d.code).collect::<Vec<_>>()
    );
}

#[test]
fn a_document_scope_lists_source_is_checked_like_a_cells() {
    // The two scopes answer the same question the same way: an undeclared
    // source and a declared SCALAR are different mistakes, and a declared
    // array is neither.
    let ok = validate(Some(&ldefs()), &list_over("releases", "{name}"), None);
    assert!(codes(&ok, "unknown_data_key").is_empty() && codes(&ok, "not_an_array").is_empty());

    let unknown = validate(Some(&ldefs()), &list_over("nope", "x"), None);
    assert!(unknown
        .iter()
        .any(|d| d.code == "unknown_data_key" && d.message.contains("nope")));

    let scalar = validate(Some(&ldefs()), &list_over("venue", "x"), None);
    assert!(scalar.iter().any(|d| d.code == "not_an_array"));

    // And still silent with no definitions to check against.
    assert!(validate(None, &list_over("nope", "x"), None)
        .iter()
        .all(|d| d.code != "unknown_data_key" && d.code != "not_an_array"));
}

#[test]
fn a_cell_lists_row_relative_source_ignores_a_top_level_namesake() {
    // `orders` rows DO declare `items`; a top-level `tags` does not make a
    // row-relative `tags` legal, because layout reads it from the row.
    let t = tpl(
        "      - type: repeat\n        data: { key: orders }\n        cell:\n          items:\n            - type: list\n              data: { key: tags }\n",
    );
    let diags = validate(Some(&ldefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("a top-level array is not a row field");
    assert!(d.message.contains("tags"));
    assert!(d.message.contains("orders"), "{}", d.message);
}
