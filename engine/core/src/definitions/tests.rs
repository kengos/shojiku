//! Unit tests for the `definitions` schema wire: parse basics, typo
//! safety, the v1-form hint, and round-trip discipline. Caps and the
//! field-type mapping live in the child modules.

mod caps;
mod mapping;
mod size;

use super::*;

const SAMPLE: &str = r#"
version: 0.2.0
type: object
required: [order]
properties:
  order:
    type: object
    title: 注文
    properties:
      code:
        type: string
        title: 注文コード
        example: ORDER1
      ordered_at:
        type: string
        format: date-time
        title: 注文日時
        displayFormats:
          - id: default
            label: 標準
          - id: ja
            label: 日本語表記
  order_items:
    type: array
    title: 注文明細
    items:
      type: object
      title: 注文明細行
      properties:
        quantity:
          type: integer
          format: quantity
          unit: item
        unit_price_ex_tax:
          type: number
          format: currency
"#;

#[test]
fn parses_sample_definitions() {
    let defs = parse_definitions(SAMPLE).expect("parse");
    assert_eq!(defs.version.as_deref(), Some("0.2.0"));
    assert_eq!(defs.required, vec!["order"]);

    let order = &defs.properties["order"];
    assert_eq!(order.schema_type, SchemaType::Object);
    assert_eq!(order.title.as_deref(), Some("注文"));
    let code = &order.properties["code"];
    assert_eq!(code.field_type(), FieldType::String);
    assert_eq!(code.example, Some(serde_json::json!("ORDER1")));
    assert_eq!(order.properties["ordered_at"].display_formats.len(), 2);

    let items = &defs.properties["order_items"];
    assert_eq!(items.schema_type, SchemaType::Array);
    let row = items.items.as_deref().expect("items schema");
    assert_eq!(row.properties["quantity"].unit.as_deref(), Some("item"));
}

#[test]
fn field_type_from_name() {
    assert_eq!(FieldType::from_name("currency"), Some(FieldType::Currency));
    assert_eq!(FieldType::from_name("datetime"), Some(FieldType::Datetime));
    assert_eq!(FieldType::from_name("image"), Some(FieldType::Image));
    assert_eq!(FieldType::from_name("bogus"), None);
}

#[test]
fn every_field_type_name_round_trips() {
    // `as_str` is the spelling diagnostics report a field's effective type
    // as; it must stay the one `{key:type}` overrides parse.
    for field_type in [
        FieldType::String,
        FieldType::Number,
        FieldType::Currency,
        FieldType::Datetime,
        FieldType::Date,
        FieldType::Quantity,
        FieldType::Percentage,
        FieldType::Boolean,
        FieldType::Image,
    ] {
        assert_eq!(FieldType::from_name(field_type.as_str()), Some(field_type));
    }
}

#[test]
fn rejects_misspelled_schema_type() {
    // A value typo is a located parse error, never a silent fallback.
    let err = parse_definitions("type: object\nproperties:\n  a:\n    type: strng\n")
        .expect_err("must reject");
    assert!(matches!(err, CoreError::Located { .. }), "got: {err:?}");
}

#[test]
fn rejects_unknown_top_level_key() {
    let err = parse_definitions("locale: ja-JP\ntype: object\nproperties: {}\n")
        .expect_err("must reject");
    let CoreError::Located { what, message, .. } = &err else { panic!("{err:?}") };
    assert_eq!(what, &"definitions");
    assert!(message.contains("locale"), "message: {message}");
}

#[test]
fn rejects_unknown_schema_key_with_path() {
    let err =
        parse_definitions("type: object\nproperties:\n  a:\n    type: string\n    zzz: nope\n")
            .expect_err("must reject");
    let CoreError::Located { path, line, .. } = &err else { panic!("{err:?}") };
    assert_eq!(path, "properties.a.zzz");
    assert_eq!(*line, 5);
}

#[test]
fn v1_groups_form_gets_a_migration_hint() {
    let err = parse_definitions("groups:\n  - id: g\n    fields: []\n").expect_err("reject");
    let CoreError::Located { path, message, .. } = &err else { panic!("{err:?}") };
    assert_eq!(path, "groups");
    assert!(message.contains("v1 form"), "message: {message}");
    assert!(
        message.contains("docs/engine/definitions.md"),
        "message: {message}"
    );
}

#[test]
fn root_must_be_an_object() {
    let err = parse_definitions("type: string\n").expect_err("must reject");
    let CoreError::Located { path, message, .. } = &err else { panic!("{err:?}") };
    assert_eq!(path, "type");
    assert!(message.contains("type: object"), "message: {message}");
}

#[test]
fn enum_key_parses_into_enum_values() {
    let defs = parse_definitions(
        "type: object\nproperties:\n  status:\n    type: string\n    enum: [draft, sent]\n",
    )
    .expect("parse");
    let status = &defs.properties["status"];
    let values = status.enum_values.as_ref().expect("enum");
    assert_eq!(values.len(), 2);
    assert_eq!(values[0].value(), &serde_json::json!("draft"));
    assert_eq!(values[0].label(), None);
}

#[test]
fn enum_members_mix_bare_and_labeled_forms() {
    let defs = parse_definitions(
        "type: object\nproperties:\n  status:\n    type: string\n    enum:\n      - { value: backorder, label: （入荷待ち） }\n      - arrived\n",
    )
    .expect("parse");
    let values = defs.properties["status"]
        .enum_values
        .as_ref()
        .expect("enum");
    assert_eq!(values[0].value(), &serde_json::json!("backorder"));
    assert_eq!(values[0].label(), Some("（入荷待ち）"));
    assert_eq!(values[1].value(), &serde_json::json!("arrived"));
    assert_eq!(values[1].label(), None);
}

#[test]
fn each_enum_member_round_trips_in_its_authored_form() {
    // A bare member stays bare — the Designer's "only touched keys change"
    // write policy reaches inside the list.
    let src = "type: object\nproperties:\n  status:\n    type: string\n    enum:\n    - value: backorder\n      label: 入荷待ち\n    - arrived\n";
    let defs = parse_definitions(src).expect("parse");
    let yaml = serde_yaml::to_string(&defs).expect("serialize");
    assert!(yaml.contains("- arrived"), "bare member changed: {yaml}");
    assert!(yaml.contains("label: 入荷待ち"), "label lost: {yaml}");
    assert_eq!(yaml.matches("value:").count(), 1, "got: {yaml}");
}

#[test]
fn a_typo_in_a_labeled_enum_member_is_a_parse_error() {
    // The reason the entry is not an untagged fallback to a free-form
    // value: a mistyped key must be loud, not silently kept as an object
    // member no params value could ever match.
    let err = parse_definitions(
        "type: object\nproperties:\n  status:\n    type: string\n    enum:\n      - { value: a, lable: b }\n",
    )
    .expect_err("typo must not parse");
    let message = err.to_string();
    assert!(message.contains("lable"), "message: {message}");
}

#[test]
fn a_labeled_enum_member_needs_a_scalar_value() {
    let err = parse_definitions(
        "type: object\nproperties:\n  status:\n    type: string\n    enum:\n      - value: [1, 2]\n        label: pair\n",
    )
    .expect_err("container value must not parse");
    assert!(err.to_string().contains("scalar `value`"), "message: {err}");
}

#[test]
fn a_labeled_enum_member_needs_a_string_label() {
    let err = parse_definitions(
        "type: object\nproperties:\n  status:\n    type: string\n    enum:\n      - value: a\n        label: [x]\n",
    )
    .expect_err("non-string label must not parse");
    assert!(!err.to_string().is_empty());
}

#[test]
fn round_trips_without_injected_nulls() {
    let defs =
        parse_definitions("type: object\nproperties:\n  a:\n    type: string\n").expect("parse");
    // Serialize the leaf node ALONE: unset optionals are skipped — no
    // `title: null`, no `minLength: null` (the Designer write policy).
    let yaml = serde_yaml::to_string(&defs.properties["a"]).expect("serialize");
    assert!(!yaml.contains("null"), "unexpected null in: {yaml}");
    let doc = serde_yaml::to_string(&defs).expect("serialize");
    assert!(!doc.contains("version"), "version leaked: {doc}");
    let again = parse_definitions(&doc).expect("reparse");
    assert_eq!(again.properties.len(), 1);
}

#[test]
fn placeholder_parses_and_round_trips() {
    let defs = parse_definitions(
        "type: object\nproperties:\n  birth_date:\n    type: string\n    format: date\n    placeholder: \"　年　月　日\"\n  name:\n    type: string\n",
    )
    .expect("parse");
    assert_eq!(
        defs.properties["birth_date"].placeholder.as_deref(),
        Some("　年　月　日")
    );
    assert!(defs.properties["name"].placeholder.is_none());
    let yaml = serde_yaml::to_string(&defs).expect("serialize");
    assert_eq!(yaml.matches("placeholder:").count(), 1, "got: {yaml}");
}
