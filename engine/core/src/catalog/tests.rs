//! Unit tests for the schema → lookup-table flatten walk.

mod nested;
mod paths;

use super::*;
use crate::definitions::parse_definitions;

fn sample() -> Catalog {
    let defs = parse_definitions(
        r#"
type: object
properties:
  order:
    type: object
    properties:
      code:
        type: string
      ordered_at:
        type: string
        format: date-time
        displayFormats:
          - id: default
          - id: ja
  order_items:
    type: array
    items:
      type: object
      properties:
        quantity:
          type: integer
          format: quantity
          unit: item
"#,
    )
    .expect("parse");
    Catalog::from_definitions(&defs)
}

#[test]
fn scalar_lookup() {
    let catalog = sample();
    let spec = catalog.scalar("order.code").expect("spec");
    assert_eq!(spec.field_type, FieldType::String);
    assert!(catalog.scalar("order.unknown").is_none());
}

#[test]
fn array_lookup() {
    let catalog = sample();
    assert!(catalog.is_array("order_items"));
    assert!(!catalog.is_array("order"));

    let spec = catalog
        .array_field("order_items", "quantity")
        .expect("spec");
    assert_eq!(spec.field_type, FieldType::Quantity);
    assert_eq!(spec.unit.as_deref(), Some("item"));
    assert!(catalog.array_field("order_items", "nope").is_none());
}

#[test]
fn contains_covers_both_kinds() {
    let catalog = sample();
    assert!(catalog.contains("order.code"));
    assert!(catalog.contains("order_items"));
    assert!(!catalog.contains("ghost"));
}

#[test]
fn declared_display_formats_are_collected() {
    let catalog = sample();
    let spec = catalog.scalar("order.ordered_at").expect("spec");
    assert_eq!(spec.formats, vec!["default", "ja"]);
}

#[test]
fn deep_nesting_flattens_to_dotted_keys() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  issuer:
    type: object
    properties:
      address:
        type: object
        properties:
          city:
            type: string
"#,
    )
    .expect("parse");
    let catalog = Catalog::from_definitions(&defs);
    assert!(catalog.scalar("issuer.address.city").is_some());
    // Intermediate objects are structure, not fields.
    assert!(catalog.scalar("issuer.address").is_none());
    assert!(!catalog.contains("issuer"));
}

#[test]
fn nested_arrays_register_under_their_dotted_path() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  order:
    type: object
    properties:
      lines:
        type: array
        items:
          type: object
          properties:
            shipping:
              type: object
              properties:
                weight:
                  type: number
"#,
    )
    .expect("parse");
    let catalog = Catalog::from_definitions(&defs);
    assert!(catalog.is_array("order.lines"));
    // Row-relative keys flatten dotted through nested row objects.
    assert!(catalog
        .array_field("order.lines", "shipping.weight")
        .is_some());
}

#[test]
fn scalar_item_arrays_have_no_row_fields() {
    let defs = parse_definitions(
        "type: object\nproperties:\n  tags:\n    type: array\n    items:\n      type: string\n",
    )
    .expect("parse");
    let catalog = Catalog::from_definitions(&defs);
    assert!(catalog.is_array("tags"));
    assert!(catalog.array_field("tags", "anything").is_none());
}

#[test]
fn currency_is_field_only_not_document_baked() {
    // The document default lives in the template `defaults.currency`, so a
    // field without its own `currency` gets `None` here and a field with
    // one keeps it.
    let defs = parse_definitions(
        r#"
type: object
properties:
  total:
    type: number
    format: currency
  usd:
    type: number
    format: currency
    currency: USD
"#,
    )
    .expect("parse");
    let catalog = Catalog::from_definitions(&defs);
    assert_eq!(catalog.scalar("total").expect("spec").currency, None);
    assert_eq!(
        catalog.scalar("usd").expect("spec").currency.as_deref(),
        Some("USD")
    );
}

#[test]
fn display_format_default_and_placeholder_plumb_through() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  issued_on:
    type: string
    format: date
    displayFormat: wareki
    placeholder: "　年　月　日"
    precision: 0
"#,
    )
    .expect("parse");
    let catalog = Catalog::from_definitions(&defs);
    let spec = catalog.scalar("issued_on").expect("spec");
    assert_eq!(spec.format.as_deref(), Some("wareki"));
    assert_eq!(spec.placeholder.as_deref(), Some("　年　月　日"));
    assert_eq!(spec.precision, Some(0));
}

#[test]
fn an_array_without_an_items_schema_still_registers() {
    let defs =
        parse_definitions("type: object\nproperties:\n  rows:\n    type: array\n").expect("parse");
    let catalog = Catalog::from_definitions(&defs);
    assert!(catalog.is_array("rows"));
    assert!(catalog.array_field("rows", "anything").is_none());
}

#[test]
fn enum_labels_reach_a_text_field_in_authored_order() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  status:
    type: string
    enum:
      - { value: backorder, label: （入荷待ち） }
      - arrived
      - { value: cancelled, label: 取消 }
  rows:
    type: array
    items:
      type: object
      properties:
        state:
          type: string
          enum:
            - { value: open, label: 受付中 }
"#,
    )
    .expect("parse");
    let catalog = Catalog::from_definitions(&defs);
    let spec = catalog.scalar("status").expect("spec");
    // Authored order, bare members contributing nothing.
    assert_eq!(
        spec.enum_labels,
        vec![
            (serde_json::json!("backorder"), "（入荷待ち）".to_string()),
            (serde_json::json!("cancelled"), "取消".to_string()),
        ]
    );
    // A row-relative field carries them the same way, so a table column
    // renders labels with no extra wiring.
    let row = catalog.array_field("rows", "state").expect("row spec");
    assert_eq!(row.enum_labels.len(), 1);
}

#[test]
fn enum_labels_are_dropped_for_every_non_text_field() {
    // The formatter's other arms have nowhere to put them; validate warns
    // separately, and the catalog must not hand them on regardless.
    let defs = parse_definitions(
        r#"
type: object
properties:
  rank:
    type: integer
    enum:
      - { value: 1, label: 一号 }
  due:
    type: string
    format: date
    enum:
      - { value: "2026-01-01", label: 期首 }
  bare:
    type: string
    enum: [a, b]
"#,
    )
    .expect("parse");
    let catalog = Catalog::from_definitions(&defs);
    assert!(catalog.scalar("rank").expect("spec").enum_labels.is_empty());
    assert!(catalog.scalar("due").expect("spec").enum_labels.is_empty());
    assert!(catalog.scalar("bare").expect("spec").enum_labels.is_empty());
}
