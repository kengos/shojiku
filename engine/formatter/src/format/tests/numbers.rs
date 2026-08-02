//! Currency (three variants + fractions), number, quantity (semantic
//! units + plurals), and percentage formatting.

use super::*;
use crate::lang::UnitSpec;

#[test]
fn currency_default_variant_is_the_bare_amount() {
    // Behavior: `default` composes with template literals.
    let pack = ja_pack();
    let out = fmt(&json!(5000), Some(&spec(FieldType::Currency)), None, &pack);
    assert_eq!(out, "5,000");
}

#[test]
fn currency_symbol_variant() {
    let pack = ja_pack();
    let out = fmt(
        &json!(5000),
        Some(&spec(FieldType::Currency)),
        Some("symbol"),
        &pack,
    );
    assert_eq!(out, "¥5,000");
}

#[test]
fn currency_name_variant_is_the_receipt_suffix() {
    let pack = ja_pack();
    let out = fmt(
        &json!(9000),
        Some(&spec(FieldType::Currency)),
        Some("name"),
        &pack,
    );
    assert_eq!(out, "9,000円");
}

#[test]
fn negative_currency_keeps_the_sign_outside_the_layout() {
    let pack = ja_pack();
    let out = fmt(
        &json!(-1234567),
        Some(&spec(FieldType::Currency)),
        Some("symbol"),
        &pack,
    );
    assert_eq!(out, "-¥1,234,567");
}

#[test]
fn currency_code_from_spec_uses_its_precision() {
    let pack = ja_pack();
    let mut s = spec(FieldType::Currency);
    s.currency = Some("USD".to_string());
    let out = fmt(&json!(12.5), Some(&s), Some("symbol"), &pack);
    assert_eq!(out, "$12.50");
}

#[test]
fn unlisted_currency_keeps_its_cldr_fraction_digits() {
    // JOD is not in the hand-written pack but has 3 digits in the CLDR
    // Fractions table — the old fallback truncated to 0.
    let pack = ja_pack();
    let mut s = spec(FieldType::Currency);
    s.currency = Some("JOD".to_string());
    let out = fmt(&json!(12.3456), Some(&s), None, &pack);
    assert_eq!(out, "12.346");
}

#[test]
fn unlisted_currency_symbol_variant_warns_and_uses_the_code() {
    let pack = ja_pack();
    let mut s = spec(FieldType::Currency);
    s.currency = Some("EUR".to_string());
    let out = fmt_warn(&json!(100), Some(&s), Some("symbol"), &pack);
    assert_eq!(out.text, "EUR 100.00");
    assert_eq!(
        out.warning,
        Some(FormatWarning::UnknownCurrency("EUR".into()))
    );
}

#[test]
fn name_variant_without_display_name_warns_and_suffixes_the_code() {
    let pack = ja_pack();
    let mut s = spec(FieldType::Currency);
    s.currency = Some("USD".to_string());
    // USD in the hand-written pack has a symbol but no `name`.
    let out = fmt_warn(&json!(3), Some(&s), Some("name"), &pack);
    assert_eq!(out.text, "3.00 USD");
    assert_eq!(
        out.warning,
        Some(FormatWarning::UnknownCurrency("USD".into()))
    );
}

#[test]
fn unknown_currency_variant_warns_and_renders_default() {
    let pack = ja_pack();
    let out = fmt_warn(
        &json!(5000),
        Some(&spec(FieldType::Currency)),
        Some("fancy"),
        &pack,
    );
    assert_eq!(out.text, "5,000");
    assert_eq!(
        out.warning,
        Some(FormatWarning::UnknownVariant("fancy".into()))
    );
}

#[test]
fn hostile_precision_is_clamped() {
    // definitions are untrusted input; a huge precision must not make
    // the formatter try to allocate a multi-gigabyte string.
    let pack = ja_pack();
    let mut s = spec(FieldType::Currency);
    s.precision = Some(u32::MAX);
    let out = fmt(&json!(5000), Some(&s), Some("symbol"), &pack);
    assert!(out.starts_with("¥5,000."));
    assert!(out.len() < 40, "not clamped: {} chars", out.len());
}

#[test]
fn hostile_variant_name_is_truncated_in_the_warning() {
    let pack = ja_pack();
    let long = "v".repeat(10_000);
    let out = fmt_warn(
        &json!(1),
        Some(&spec(FieldType::Currency)),
        Some(&long),
        &pack,
    );
    let Some(FormatWarning::UnknownVariant(name)) = out.warning else {
        panic!("expected UnknownVariant");
    };
    assert!(name.chars().count() <= 33, "unbounded echo: {name}");
}

#[test]
fn formats_quantity_with_the_default_item_unit() {
    let pack = ja_pack();
    let out = fmt(&json!(3), Some(&spec(FieldType::Quantity)), None, &pack);
    assert_eq!(out, "3点");
}

#[test]
fn quantity_semantic_key_from_spec() {
    let mut pack = ja_pack();
    pack.units.insert(
        "piece".to_string(),
        UnitSpec {
            one: None,
            other: "個".to_string(),
            format: None,
        },
    );
    let mut s = spec(FieldType::Quantity);
    s.unit = Some("piece".to_string());
    let out = fmt(&json!(2), Some(&s), None, &pack);
    assert_eq!(out, "2個");
}

#[test]
fn english_quantities_pick_the_plural_category() {
    // The builtin en-US pack: `{amount} {unit}` layout + one/other words
    // (kills the old leading-space hack).
    let pack = builtin_en();
    let s = spec(FieldType::Quantity);
    assert_eq!(fmt(&json!(1), Some(&s), None, &pack), "1 item");
    assert_eq!(fmt(&json!(3), Some(&s), None, &pack), "3 items");
}

#[test]
fn unknown_unit_key_renders_verbatim_with_a_warning() {
    let pack = ja_pack();
    let mut s = spec(FieldType::Quantity);
    s.unit = Some("crates".to_string());
    let out = fmt_warn(&json!(4), Some(&s), None, &pack);
    assert_eq!(out.text, "4crates");
    assert_eq!(
        out.warning,
        Some(FormatWarning::UnknownUnit("crates".into()))
    );
}

#[test]
fn per_unit_format_overrides_the_pack_layout() {
    let mut pack = ja_pack();
    pack.units.insert(
        "boxed".to_string(),
        UnitSpec {
            one: None,
            other: "箱".to_string(),
            format: Some("{unit}: {amount}".to_string()),
        },
    );
    let mut s = spec(FieldType::Quantity);
    s.unit = Some("boxed".to_string());
    assert_eq!(fmt(&json!(7), Some(&s), None, &pack), "箱: 7");
}

#[test]
fn formats_percentage_through_the_pack_layout() {
    let pack = ja_pack();
    let s = spec(FieldType::Percentage);
    assert_eq!(fmt(&json!(0.1), Some(&s), None, &pack), "10%");
    assert_eq!(fmt(&json!(0.085), Some(&s), None, &pack), "8.5%");
}

#[test]
fn percentage_honors_locale_separators() {
    // Percentages route through format_number — a de-style pack
    // must not leak `.` decimals (the old trim_number bypass).
    let pack = LangPack::from_yaml_str(
        "id: de-XX\nnumber:\n  groupSeparator: \".\"\n  decimalSeparator: \",\"\npercentFormat: \"{amount} %\"\n",
    )
    .expect("pack");
    let s = spec(FieldType::Percentage);
    assert_eq!(fmt(&json!(0.085), Some(&s), None, &pack), "8,5 %");
    assert_eq!(fmt(&json!(12.345), Some(&s), None, &pack), "1.234,5 %");
}

#[test]
fn infers_number_and_string() {
    let pack = ja_pack();
    assert_eq!(fmt(&json!(1234567), None, None, &pack), "1,234,567");
    assert_eq!(fmt(&json!(-1234567), None, None, &pack), "-1,234,567");
    assert_eq!(fmt(&json!("hello"), None, None, &pack), "hello");
}

#[test]
fn non_string_non_number_values_display_as_strings() {
    let pack = ja_pack();
    assert_eq!(fmt(&json!(true), None, None, &pack), "true");
    assert_eq!(fmt(&json!(["a"]), None, None, &pack), r#"["a"]"#);
}

#[test]
fn null_renders_empty() {
    let pack = ja_pack();
    assert_eq!(fmt(&Value::Null, None, None, &pack), "");
}

#[test]
fn non_number_for_currency_is_error() {
    let pack = ja_pack();
    let result = format_value(
        &json!("abc"),
        Some(&spec(FieldType::Currency)),
        None,
        FormatContext::default(),
        &pack,
    );
    assert!(result.is_err());
}
