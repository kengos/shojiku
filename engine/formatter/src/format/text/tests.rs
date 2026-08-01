//! Text-arm tests: the `enum` display labels and the picks that select
//! between the declared words and the raw value.

use crate::format::tests::{fmt, fmt_warn, ja_pack, spec};
use crate::FormatWarning;
use serde_json::json;
use serde_json::Value;
use shojiku_core::{FieldSpec, FieldType};

/// A text field declaring the 引取票 status labels: one labeled member
/// and one bare one, which is how partial labeling is authored.
fn status_spec() -> FieldSpec {
    FieldSpec {
        enum_labels: vec![(json!("backorder"), "（入荷待ち）".to_string())],
        ..spec(FieldType::String)
    }
}

#[test]
fn a_labeled_value_renders_its_declared_words() {
    let pack = ja_pack();
    assert_eq!(
        fmt(&json!("backorder"), Some(&status_spec()), None, &pack),
        "（入荷待ち）"
    );
}

#[test]
fn an_unlabeled_member_renders_its_value() {
    // Partial labeling is legitimate — a member with no label falls back
    // to its value, silently.
    let pack = ja_pack();
    assert_eq!(
        fmt(&json!("arrived"), Some(&status_spec()), None, &pack),
        "arrived"
    );
}

#[test]
fn the_value_variant_renders_the_raw_value() {
    // `{status:value}` is the escape out of the label — the machine value
    // is what a code column or a lookup key wants.
    let pack = ja_pack();
    assert_eq!(
        fmt(
            &json!("backorder"),
            Some(&status_spec()),
            Some("value"),
            &pack
        ),
        "backorder"
    );
}

#[test]
fn the_default_variant_renders_the_label() {
    let pack = ja_pack();
    assert_eq!(
        fmt(
            &json!("backorder"),
            Some(&status_spec()),
            Some("default"),
            &pack
        ),
        "（入荷待ち）"
    );
}

#[test]
fn an_unknown_variant_warns_and_keeps_the_label() {
    let pack = ja_pack();
    let out = fmt_warn(
        &json!("backorder"),
        Some(&status_spec()),
        Some("wareki"),
        &pack,
    );
    assert_eq!(out.text, "（入荷待ち）");
    assert_eq!(
        out.warning,
        Some(FormatWarning::UnknownVariant("wareki".to_string()))
    );
}

#[test]
fn a_field_without_labels_ignores_a_variant_silently() {
    // Pinned as it has always behaved: the text arm has no variants of its
    // own, so an authored pick on a plain text field stays inert. Labels
    // must not turn that silence into a warning for everyone else.
    let pack = ja_pack();
    let out = fmt_warn(
        &json!("plain"),
        Some(&spec(FieldType::String)),
        Some("wareki"),
        &pack,
    );
    assert_eq!(out.text, "plain");
    assert_eq!(out.warning, None);
}

#[test]
fn a_spec_less_value_ignores_a_variant_silently() {
    let pack = ja_pack();
    let out = fmt_warn(&json!("plain"), None, Some("wareki"), &pack);
    assert_eq!(out.text, "plain");
    assert_eq!(out.warning, None);
}

#[test]
fn an_empty_label_renders_empty() {
    // An authorable way to print nothing for one member. The VALUE is
    // still non-blank, so the binding placeholder does not fire.
    let pack = ja_pack();
    let spec = FieldSpec {
        enum_labels: vec![(json!("hidden"), String::new())],
        ..spec(FieldType::String)
    };
    assert_eq!(fmt(&json!("hidden"), Some(&spec), None, &pack), "");
}

#[test]
fn labels_match_by_value_equality_not_display_form() {
    // The lookup shares enum membership's equality, so a label declared
    // for the STRING "1" never answers for the number 1.
    let pack = ja_pack();
    let spec = FieldSpec {
        enum_labels: vec![(json!("1"), "一号".to_string())],
        ..spec(FieldType::String)
    };
    assert_eq!(fmt(&json!("1"), Some(&spec), None, &pack), "一号");
    assert_eq!(fmt(&json!(1), Some(&spec), None, &pack), "1");
}

#[test]
fn a_duplicated_value_resolves_to_its_first_label() {
    // Malformed input: picking deterministically beats diagnosing it from
    // the render path.
    let pack = ja_pack();
    let spec = FieldSpec {
        enum_labels: vec![
            (json!("dup"), "first".to_string()),
            (json!("dup"), "second".to_string()),
        ],
        ..spec(FieldType::String)
    };
    assert_eq!(fmt(&json!("dup"), Some(&spec), None, &pack), "first");
}

#[test]
fn a_null_value_stays_empty_before_any_label_lookup() {
    let pack = ja_pack();
    assert_eq!(fmt(&Value::Null, Some(&status_spec()), None, &pack), "");
}

#[test]
fn an_empty_string_value_can_carry_a_label() {
    // `{ value: "", label: … }` is authorable. At the formatter the empty
    // string is an ordinary value and resolves its label — whether it
    // ever REACHES here is the binding layer's blank guard's call (a
    // blank binding draws the placeholder instead), pinned separately in
    // the layout e2e suite.
    let pack = ja_pack();
    let spec = FieldSpec {
        enum_labels: vec![(json!(""), "未設定".to_string())],
        ..spec(FieldType::String)
    };
    assert_eq!(fmt(&json!(""), Some(&spec), None, &pack), "未設定");
}
