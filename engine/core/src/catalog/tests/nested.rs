//! A row's own array child: its dotted identity, its element fields, and
//! what the catalog claims when the schema declares no element at all.

use super::super::*;
use crate::definitions::{parse_definitions, MAX_SCHEMA_DEPTH};

pub(super) fn catalog(source: &str) -> Catalog {
    Catalog::from_definitions(&parse_definitions(source).expect("defs"))
}

pub(super) fn shipping() -> Catalog {
    catalog(
        r#"
type: object
properties:
  orders:
    type: array
    items:
      type: object
      properties:
        name:
          type: string
        items:
          type: array
          items:
            type: object
            properties:
              title:
                type: string
              price:
                type: number
                format: currency
                currency: JPY
"#,
    )
}

#[test]
fn a_rows_array_child_registers_under_the_joined_path() {
    let catalog = shipping();
    assert!(catalog.is_array("orders"));
    assert!(catalog.is_array("orders.items"));
    // Its element fields are known, with their declared specs intact.
    let price = catalog
        .array_field("orders.items", "price")
        .expect("nested element field");
    assert_eq!(price.field_type, FieldType::Currency);
    assert_eq!(price.currency.as_deref(), Some("JPY"));
    assert!(catalog.array_field("orders.items", "nope").is_none());
}

#[test]
fn the_row_relative_question_still_answers_the_same() {
    // The four consumers that ask "is this row key an array?" are
    // unchanged by the nested source gaining an identity of its own.
    let catalog = shipping();
    assert!(catalog.row_array("orders", "items"));
    assert!(!catalog.row_array("orders", "name"));
    assert!(!catalog.row_array("orders", "nope"));
    // A nested array is NOT a leaf field of its parent.
    assert!(catalog.array_field("orders", "items").is_none());
}

#[test]
fn arrays_nest_to_any_depth_the_schema_declares() {
    let catalog = catalog(
        r#"
type: object
properties:
  a:
    type: array
    items:
      type: object
      properties:
        b:
          type: array
          items:
            type: object
            properties:
              c:
                type: array
                items:
                  type: object
                  properties:
                    leaf:
                      type: string
"#,
    );
    for key in ["a", "a.b", "a.b.c"] {
        assert!(catalog.is_array(key), "{key} should be an array source");
    }
    assert!(catalog.array_field("a.b.c", "leaf").is_some());
    assert!(catalog.row_array("a.b", "c"));
}

#[test]
fn a_nested_array_inside_a_row_object_joins_the_dotted_row_key() {
    let catalog = catalog(
        r#"
type: object
properties:
  orders:
    type: array
    items:
      type: object
      properties:
        ship:
          type: object
          properties:
            parcels:
              type: array
              items:
                type: object
                properties:
                  code:
                    type: string
"#,
    );
    assert!(catalog.row_array("orders", "ship.parcels"));
    assert!(catalog.array_field("orders.ship.parcels", "code").is_some());
}

#[test]
fn a_scalar_element_carries_a_spec_and_no_fields() {
    let catalog = catalog(
        r#"
type: object
properties:
  causes:
    type: array
    items:
      type: string
      enum: [fire, flood]
"#,
    );
    let ArrayElement::Scalar(spec) = catalog.array_element("causes").expect("element") else {
        panic!("a scalar `items:` should carry a spec");
    };
    assert_eq!(spec.field_type, FieldType::String);
    assert_eq!(spec.enum_values.len(), 2);
    assert!(catalog.array_field("causes", "anything").is_none());
}

#[test]
fn an_object_element_reports_object_and_an_absent_items_reports_undeclared() {
    let catalog = catalog(
        r#"
type: object
properties:
  rows:
    type: array
    items:
      type: object
      properties:
        name:
          type: string
  bare:
    type: array
"#,
    );
    assert!(matches!(
        catalog.array_element("rows"),
        Some(ArrayElement::Object)
    ));
    assert!(matches!(
        catalog.array_element("bare"),
        Some(ArrayElement::Undeclared)
    ));
    assert!(catalog.array_element("nope").is_none());
}

#[test]
fn an_array_of_arrays_declares_no_element_and_no_fields() {
    // Hostile-shaped but legal: the walk must neither panic nor fabricate
    // an element for a shape it does not model.
    let catalog = catalog(
        r#"
type: object
properties:
  grid:
    type: array
    items:
      type: array
      items:
        type: string
"#,
    );
    assert!(catalog.is_array("grid"));
    assert!(matches!(
        catalog.array_element("grid"),
        Some(ArrayElement::Undeclared)
    ));
    assert!(catalog.array_field("grid", "0").is_none());
}

#[test]
fn a_dotted_row_field_name_does_not_collide_with_a_nested_path() {
    // A row field literally NAMED `items.title` and a nested array
    // `items` carrying `title` flatten into different tables.
    let catalog = catalog(
        r#"
type: object
properties:
  orders:
    type: array
    items:
      type: object
      properties:
        "items.title":
          type: boolean
        items:
          type: array
          items:
            type: object
            properties:
              title:
                type: string
"#,
    );
    let flat = catalog
        .array_field("orders", "items.title")
        .expect("the literally-named row field");
    assert_eq!(flat.field_type, FieldType::Boolean);
    let nested = catalog
        .array_field("orders.items", "title")
        .expect("the nested element field");
    assert_eq!(nested.field_type, FieldType::String);
}

#[test]
fn nesting_at_the_parse_cap_flattens() {
    // The walk carries no depth argument: `MAX_SCHEMA_DEPTH` is enforced
    // at parse, and this pins that the deepest ACCEPTED schema still
    // flattens (rather than recursing past what the parser admits).
    let mut source = String::from("type: object\nproperties:\n  a:\n");
    let mut indent = String::from("    ");
    let mut path = String::from("a");
    // Each level is `type: array` + `items: type: object` + one property,
    // which is the two schema nodes the depth cap counts.
    let levels = (MAX_SCHEMA_DEPTH - 1) / 2;
    for i in 0..levels {
        source.push_str(&format!(
            "{indent}type: array\n{indent}items:\n{indent}  type: object\n{indent}  properties:\n{indent}    n{i}:\n"
        ));
        indent.push_str("      ");
        path.push_str(&format!(".n{i}"));
    }
    source.push_str(&format!("{indent}type: string\n"));
    let catalog = catalog(&source);
    let (array_path, leaf) = path.rsplit_once('.').expect("a nested leaf");
    assert!(catalog.is_array("a"));
    assert!(
        catalog.array_field(array_path, leaf).is_some(),
        "the deepest declared leaf should be reachable at {array_path}"
    );
}
