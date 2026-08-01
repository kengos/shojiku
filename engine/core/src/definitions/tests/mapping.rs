//! The `(type, format)` → field-type mapping table.

use super::super::*;

fn leaf(yaml: &str) -> Schema {
    let doc = format!("type: object\nproperties:\n  f:\n{yaml}");
    parse_definitions(&doc).expect("parse").properties["f"].clone()
}

#[test]
fn known_formats_refine_the_base_type() {
    assert_eq!(
        leaf("    type: string\n    format: date-time\n").field_type(),
        FieldType::Datetime
    );
    assert_eq!(
        leaf("    type: string\n    format: date\n").field_type(),
        FieldType::Date
    );
    assert_eq!(
        leaf("    type: string\n    format: image\n").field_type(),
        FieldType::Image
    );
    assert_eq!(
        leaf("    type: number\n    format: currency\n").field_type(),
        FieldType::Currency
    );
    assert_eq!(
        leaf("    type: integer\n    format: percentage\n").field_type(),
        FieldType::Percentage
    );
    assert_eq!(
        leaf("    type: integer\n    format: quantity\n").field_type(),
        FieldType::Quantity
    );
}

#[test]
fn bare_base_types_map_directly() {
    assert_eq!(leaf("    type: string\n").field_type(), FieldType::String);
    assert_eq!(leaf("    type: number\n").field_type(), FieldType::Number);
    assert_eq!(leaf("    type: integer\n").field_type(), FieldType::Number);
    assert_eq!(leaf("    type: boolean\n").field_type(), FieldType::Boolean);
}

#[test]
fn unknown_formats_are_hints_and_keep_the_base() {
    // The open vocabulary: a generation hint is not a mistake.
    let schema = leaf("    type: string\n    format: person-name\n");
    assert_eq!(schema.mapped(), (FieldType::String, false));
}

#[test]
fn known_format_on_the_wrong_base_flags_ignored() {
    // `format: currency` on a string is a declared-schema mistake the
    // validator warns about; the base type stays.
    let schema = leaf("    type: string\n    format: currency\n");
    assert_eq!(schema.mapped(), (FieldType::String, true));
    let schema = leaf("    type: number\n    format: date-time\n");
    assert_eq!(schema.mapped(), (FieldType::Number, true));
    let schema = leaf("    type: boolean\n    format: image\n");
    assert_eq!(schema.mapped(), (FieldType::Boolean, true));
}

#[test]
fn schema_type_wire_spellings() {
    for (t, s) in [
        (SchemaType::String, "string"),
        (SchemaType::Number, "number"),
        (SchemaType::Integer, "integer"),
        (SchemaType::Boolean, "boolean"),
        (SchemaType::Object, "object"),
        (SchemaType::Array, "array"),
    ] {
        assert_eq!(t.as_str(), s);
    }
}
