//! Number→currency coercion: a `symbol`/`name` placement pick on a
//! plain number renders as currency (money display without definitions).

use super::*;
use shojiku_core::NamedFormatKind;

#[test]
fn a_symbol_pick_on_a_bare_number_renders_the_currency_symbol() {
    let pack = ja_pack();
    let out = fmt(&json!(3200), None, Some("symbol"), &pack);
    assert_eq!(out, "¥3,200");
}

#[test]
fn a_name_pick_on_a_bare_number_renders_the_currency_name() {
    let pack = ja_pack();
    let out = fmt(&json!(3200), None, Some("name"), &pack);
    assert_eq!(out, "3,200円");
}

#[test]
fn a_negative_coerced_number_keeps_the_sign_outside_the_symbol() {
    let pack = ja_pack();
    let out = fmt(&json!(-3200), None, Some("symbol"), &pack);
    assert_eq!(out, "-¥3,200");
}

#[test]
fn a_coerced_number_follows_the_document_currency_and_its_precision() {
    // The document `defaults.currency` supplies the code; USD carries
    // two fraction digits via the pack's per-code precision.
    let pack = ja_pack();
    let ctx = FormatContext {
        currency: Some("USD"),
        ..FormatContext::default()
    };
    let out = format_value(&json!(3200), None, Some("symbol"), ctx, &pack).expect("format");
    assert_eq!(out.warning, None);
    assert_eq!(out.text, "$3,200.00");
}

#[test]
fn a_coerced_number_with_an_unknown_code_degrades_to_the_code() {
    // No display data for the code: it renders as its own symbol with a
    // clipped `UnknownCurrency` warning; the CLDR fractions default (2)
    // still applies.
    let pack = ja_pack();
    let ctx = FormatContext {
        currency: Some("ZZZ"),
        ..FormatContext::default()
    };
    let out = format_value(&json!(5), None, Some("symbol"), ctx, &pack).expect("format");
    assert_eq!(out.text, "ZZZ 5.00");
    assert!(matches!(
        out.warning,
        Some(FormatWarning::UnknownCurrency(_))
    ));
}

#[test]
fn the_coercion_does_not_widen_to_percentage_or_quantity() {
    // A `symbol` pick on the other numeric types stays an unknown
    // variant: the plain form renders with a warning, exactly as before.
    let pack = ja_pack();
    let pct = fmt_warn(
        &json!(0.1),
        Some(&spec(FieldType::Percentage)),
        Some("symbol"),
        &pack,
    );
    assert_eq!(pct.text, "10%");
    assert!(matches!(
        pct.warning,
        Some(FormatWarning::UnknownVariant(_))
    ));
    let qty = fmt_warn(
        &json!(3),
        Some(&spec(FieldType::Quantity)),
        Some("symbol"),
        &pack,
    );
    assert_eq!(qty.text, "3点");
    assert!(matches!(
        qty.warning,
        Some(FormatWarning::UnknownVariant(_))
    ));
}

#[test]
fn the_coercion_does_not_touch_string_values() {
    // A string value ignores format picks entirely (pre-existing shape).
    let pack = ja_pack();
    let out = fmt(&json!("3200"), None, Some("symbol"), &pack);
    assert_eq!(out, "3200");
}

#[test]
fn a_declared_number_field_coerces_like_an_inferred_one() {
    let pack = ja_pack();
    let out = fmt(
        &json!(3200),
        Some(&spec(FieldType::Number)),
        Some("symbol"),
        &pack,
    );
    assert_eq!(out, "¥3,200");
}

#[test]
fn a_registry_entry_named_symbol_loses_to_the_coercion() {
    // A `formats:` registry pattern named `symbol` is a date pattern;
    // on a number the currency coercion wins (registry names never
    // applied to numbers anyway).
    let pack = ja_pack();
    let named = BTreeMap::from([(
        "symbol".to_string(),
        NamedFormat {
            kind: NamedFormatKind::Date,
            pattern: "yyyy.MM.dd".to_string(),
        },
    )]);
    let ctx = FormatContext {
        named: Some(&named),
        ..FormatContext::default()
    };
    let out = format_value(&json!(3200), None, Some("symbol"), ctx, &pack).expect("format");
    assert_eq!(out.warning, None);
    assert_eq!(out.text, "¥3,200");
}

#[test]
fn a_hostile_long_variant_on_a_number_degrades_with_a_clipped_echo() {
    // A near-miss variant name stays an unknown variant; the echo in the
    // warning is clipped, never unbounded attacker content.
    let pack = ja_pack();
    let long = format!("symbol{}", "あ".repeat(100));
    let out = fmt_warn(&json!(5), None, Some(&long), &pack);
    assert_eq!(out.text, "5");
    match out.warning {
        Some(FormatWarning::UnknownVariant(name)) => {
            assert!(name.chars().count() <= 33, "unclipped echo: {name}");
            assert!(name.ends_with('…'));
        }
        other => panic!("expected UnknownVariant, got {other:?}"),
    }
}
