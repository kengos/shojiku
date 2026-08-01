//! Hostile-input caps and structural-key checks on the schema walk.

use super::super::*;

/// A chain of `depth` nested objects ending in one string leaf.
fn nested(depth: usize) -> String {
    let mut yaml = String::from("type: object\nproperties:\n");
    let mut indent = String::from("  ");
    for level in 0..depth.saturating_sub(1) {
        yaml.push_str(&format!(
            "{indent}n{level}:\n{indent}  type: object\n{indent}  properties:\n"
        ));
        indent.push_str("    ");
    }
    yaml.push_str(&format!("{indent}leaf:\n{indent}  type: string\n"));
    yaml
}

#[test]
fn depth_at_the_cap_parses_and_flattens() {
    // The cap's admitted maximum must WORK downstream, not just parse.
    let defs = parse_definitions(&nested(MAX_SCHEMA_DEPTH)).expect("parse at cap");
    let catalog = crate::Catalog::from_definitions(&defs);
    let key = (0..MAX_SCHEMA_DEPTH - 1)
        .map(|level| format!("n{level}"))
        .chain(std::iter::once("leaf".to_string()))
        .collect::<Vec<_>>()
        .join(".");
    assert!(catalog.scalar(&key).is_some(), "missing {key}");

    // The params walk also works at the admitted maximum: a params tree
    // mirroring the at-cap schema with a type violation at the leaf is
    // still found (and nothing overflows).
    let mut value = serde_json::json!({ "leaf": 42 });
    for level in (0..MAX_SCHEMA_DEPTH - 1).rev() {
        value = serde_json::json!({ (format!("n{level}")): value });
    }
    let template = crate::parse_template("sections:\n  body:\n    type: flow\n    items: []\n")
        .expect("template");
    let diags = crate::validate(Some(&defs), &template, Some(&value));
    assert!(
        diags.iter().any(|d| d.code == "params_type_mismatch"),
        "{diags:?}"
    );
}

#[test]
fn depth_past_the_cap_is_a_located_error() {
    let err = parse_definitions(&nested(MAX_SCHEMA_DEPTH + 1)).expect_err("reject");
    let CoreError::Located { message, .. } = &err else { panic!("{err:?}") };
    assert!(message.contains("deeper than"), "message: {message}");
}

#[test]
fn hostile_deep_nesting_errors_instead_of_crashing() {
    // Far past every cap: the parser layer (or the walk) must return an
    // error — never a stack overflow.
    assert!(parse_definitions(&nested(5000)).is_err());
}

#[test]
fn node_count_past_the_cap_is_an_error() {
    let mut yaml = String::from("type: object\nproperties:\n");
    for i in 0..=MAX_SCHEMA_NODES {
        yaml.push_str(&format!("  k{i}:\n    type: string\n"));
    }
    let err = parse_definitions(&yaml).expect_err("reject");
    let CoreError::Located { message, .. } = &err else { panic!("{err:?}") };
    assert!(message.contains("schema nodes"), "message: {message}");
}

#[test]
fn enum_list_past_the_cap_is_an_error() {
    let values: Vec<String> = (0..=MAX_ENUM_VALUES).map(|i| format!("v{i}")).collect();
    let yaml = format!(
        "type: object\nproperties:\n  status:\n    type: string\n    enum: [{}]\n",
        values.join(", ")
    );
    let err = parse_definitions(&yaml).expect_err("reject");
    let CoreError::Located { message, .. } = &err else { panic!("{err:?}") };
    assert!(message.contains("enum"), "message: {message}");

    // The cap itself is admitted — the boundary is what a hostile list has
    // to clear, so pin both sides of it.
    let values: Vec<String> = (0..MAX_ENUM_VALUES).map(|i| format!("v{i}")).collect();
    let yaml = format!(
        "type: object\nproperties:\n  status:\n    type: string\n    enum: [{}]\n",
        values.join(", ")
    );
    parse_definitions(&yaml).expect("the cap itself parses");
}

#[test]
fn properties_on_a_non_object_is_an_error() {
    let err = parse_definitions(
        "type: object\nproperties:\n  a:\n    type: string\n    properties:\n      b:\n        type: string\n",
    )
    .expect_err("reject");
    let CoreError::Located { path, message, .. } = &err else { panic!("{err:?}") };
    assert_eq!(path, "properties.a");
    assert!(
        message.contains("`properties` requires"),
        "message: {message}"
    );
}

#[test]
fn required_on_a_non_object_is_an_error() {
    let err =
        parse_definitions("type: object\nproperties:\n  a:\n    type: array\n    required: [x]\n")
            .expect_err("reject");
    let CoreError::Located { message, .. } = &err else { panic!("{err:?}") };
    assert!(
        message.contains("`required` requires"),
        "message: {message}"
    );
}

#[test]
fn items_on_a_non_array_is_an_error() {
    let err = parse_definitions(
        "type: object\nproperties:\n  a:\n    type: object\n    items:\n      type: string\n",
    )
    .expect_err("reject");
    let CoreError::Located { message, .. } = &err else { panic!("{err:?}") };
    assert!(message.contains("`items` requires"), "message: {message}");
}

#[test]
fn arrays_inside_array_rows_parse_and_skip_the_row_fields() {
    // A row can carry a list (a `list` item inside a repeat cell binds it):
    // the schema stays params-isomorphic, so this parses; the catalog
    // registers the row's SCALAR fields only — row-scoped array bindings
    // are layout's check, not the catalog's.
    let defs = parse_definitions(
        "type: object\nproperties:\n  rows:\n    type: array\n    items:\n      type: object\n      properties:\n        name:\n          type: string\n        inner:\n          type: array\n          items:\n            type: string\n",
    )
    .expect("parse");
    let catalog = crate::Catalog::from_definitions(&defs);
    assert!(catalog.array_field("rows", "name").is_some());
    assert!(catalog.array_field("rows", "inner").is_none());
    assert!(catalog.row_array("rows", "inner"));
    assert!(!catalog.row_array("rows", "name"));
    assert!(!catalog.row_array("ghost", "inner"));
}

#[test]
fn array_of_arrays_parses() {
    let defs = parse_definitions(
        "type: object\nproperties:\n  grid:\n    type: array\n    items:\n      type: array\n      items:\n        type: number\n",
    )
    .expect("parse");
    assert!(crate::Catalog::from_definitions(&defs).is_array("grid"));
}

#[test]
fn required_must_name_a_declared_property() {
    let root =
        parse_definitions("type: object\nrequired: [ghost]\nproperties:\n  a:\n    type: string\n")
            .expect_err("reject");
    let CoreError::Located { message, .. } = &root else { panic!("{root:?}") };
    assert!(message.contains("not a declared property"), "{message}");

    let nested = parse_definitions(
        "type: object\nproperties:\n  o:\n    type: object\n    required: [zzz]\n    properties:\n      a:\n        type: string\n",
    )
    .expect_err("reject");
    assert!(matches!(nested, CoreError::Located { .. }), "{nested:?}");
}
