//! Format precedence: template per-type defaults, the `formats:` named
//! registry, `Field.format`, and the placement pick — low to high.

use super::*;
use shojiku_core::{FormatDefaults, FormatRef, InlineFormat, NamedFormat, NamedFormatKind};
use std::collections::BTreeMap;

fn date() -> Value {
    json!("2026-07-05")
}

fn defaults(date: FormatRef) -> FormatDefaults {
    FormatDefaults {
        date: Some(date),
        ..FormatDefaults::default()
    }
}

fn registry() -> BTreeMap<String, NamedFormat> {
    let mut m = BTreeMap::new();
    m.insert(
        "short-date".to_string(),
        NamedFormat {
            kind: NamedFormatKind::Date,
            pattern: "M/d".to_string(),
        },
    );
    m
}

fn run(
    spec_format: Option<&str>,
    variant: Option<&str>,
    defaults: Option<&FormatDefaults>,
    named: Option<&BTreeMap<String, NamedFormat>>,
    pack: &LangPack,
) -> Formatted {
    let mut s = spec(FieldType::Date);
    s.format = spec_format.map(str::to_string);
    let ctx = FormatContext {
        defaults,
        named,
        ..FormatContext::default()
    };
    format_value(&date(), Some(&s), variant, ctx, pack).expect("format")
}

#[test]
fn template_default_applies_when_nothing_else_picks() {
    let pack = ja_pack();
    let d = defaults(FormatRef::Name("wareki".to_string()));
    let out = run(None, None, Some(&d), None, &pack);
    assert_eq!(out.text, "令和8年7月5日");
    assert_eq!(out.warning, None);
}

#[test]
fn inline_pattern_default_renders_directly() {
    let pack = ja_pack();
    let d = defaults(FormatRef::Inline(InlineFormat {
        pattern: "yyyy-MM-dd(E)".to_string(),
    }));
    let out = run(None, None, Some(&d), None, &pack);
    assert_eq!(out.text, "2026-07-05(日)");
}

#[test]
fn datetime_template_default_applies_too() {
    let pack = ja_pack();
    let d = FormatDefaults {
        datetime: Some(FormatRef::Name("ja".to_string())),
        ..FormatDefaults::default()
    };
    let ctx = FormatContext {
        defaults: Some(&d),
        named: None,
        currency: None,
    };
    let out = format_value(
        &json!("2026-07-05T20:00:30+09:00"),
        Some(&spec(FieldType::Datetime)),
        None,
        ctx,
        &pack,
    )
    .expect("format");
    assert_eq!(out.text, "2026年7月5日(日) 20:00");
}

#[test]
fn field_format_beats_the_template_default() {
    let pack = ja_pack();
    let d = defaults(FormatRef::Name("long".to_string()));
    let out = run(Some("wareki"), None, Some(&d), None, &pack);
    assert_eq!(out.text, "令和8年7月5日");
}

#[test]
fn placement_beats_the_field_format() {
    let pack = ja_pack();
    let d = defaults(FormatRef::Name("long".to_string()));
    let out = run(Some("wareki"), Some("default"), Some(&d), None, &pack);
    assert_eq!(out.text, "2026/07/05(日)");
    assert_eq!(out.warning, None);
}

#[test]
fn registry_name_resolves_before_pack_variants() {
    let pack = ja_pack();
    let named = registry();
    let out = run(None, Some("short-date"), None, Some(&named), &pack);
    assert_eq!(out.text, "7/5");
}

#[test]
fn registry_name_works_as_a_template_default_too() {
    let pack = ja_pack();
    let named = registry();
    let d = defaults(FormatRef::Name("short-date".to_string()));
    let out = run(None, None, Some(&d), Some(&named), &pack);
    assert_eq!(out.text, "7/5");
}

#[test]
fn unknown_template_default_warns_and_falls_back() {
    let pack = ja_pack();
    let d = defaults(FormatRef::Name("nope".to_string()));
    let out = run(None, None, Some(&d), None, &pack);
    assert_eq!(out.text, "2026/07/05(日)");
    assert_eq!(
        out.warning,
        Some(FormatWarning::UnknownVariant("nope".into()))
    );
}

#[test]
fn currency_inline_pattern_is_ignored_with_a_warning() {
    let pack = ja_pack();
    let d = FormatDefaults {
        currency: Some(FormatRef::Inline(InlineFormat {
            pattern: "M/d".to_string(),
        })),
        ..FormatDefaults::default()
    };
    let ctx = FormatContext {
        defaults: Some(&d),
        named: None,
        currency: None,
    };
    let out = format_value(
        &json!(5000),
        Some(&spec(FieldType::Currency)),
        None,
        ctx,
        &pack,
    )
    .expect("format");
    assert_eq!(out.text, "5,000");
    assert_eq!(out.warning, Some(FormatWarning::IgnoredPattern));
}

#[test]
fn currency_default_via_template_defaults() {
    // The user's target shape: elements carry only their type; the
    // document says currency renders as the 円-suffix name form.
    let pack = ja_pack();
    let d = FormatDefaults {
        currency: Some(FormatRef::Name("name".to_string())),
        ..FormatDefaults::default()
    };
    let ctx = FormatContext {
        defaults: Some(&d),
        named: None,
        currency: None,
    };
    let out = format_value(
        &json!(9000),
        Some(&spec(FieldType::Currency)),
        None,
        ctx,
        &pack,
    )
    .expect("format");
    assert_eq!(out.text, "9,000円");
    assert_eq!(out.warning, None);
}

#[test]
fn document_currency_default_drives_the_code() {
    // A currency field with no own code renders using the document
    // `defaults.currency` (USD), above the pack default (JPY).
    let pack = ja_pack();
    let ctx = FormatContext {
        currency: Some("USD"),
        ..FormatContext::default()
    };
    let out = format_value(
        &json!(12.5),
        Some(&spec(FieldType::Currency)),
        Some("symbol"),
        ctx,
        &pack,
    )
    .expect("format");
    assert_eq!(out.text, "$12.50");
    assert_eq!(out.warning, None);
}

#[test]
fn field_currency_beats_the_document_default() {
    // Precedence: Field.currency (USD) wins over the document
    // default (JPY) — the "$" symbol proves USD, not "¥".
    let pack = ja_pack();
    let mut s = spec(FieldType::Currency);
    s.currency = Some("USD".to_string());
    let ctx = FormatContext {
        currency: Some("JPY"),
        ..FormatContext::default()
    };
    let out = format_value(&json!(12.5), Some(&s), Some("symbol"), ctx, &pack).expect("format");
    assert_eq!(out.text, "$12.50");
    assert_eq!(out.warning, None);
}

#[test]
fn variantless_types_warn_on_non_default_picks() {
    // number/percentage/quantity have no named variants in v1: a pick
    // other than `default` renders the plain form + a warning.
    let pack = ja_pack();
    let d = FormatDefaults {
        number: Some(FormatRef::Name("default".to_string())),
        percentage: Some(FormatRef::Name("fancy".to_string())),
        quantity: Some(FormatRef::Inline(InlineFormat {
            pattern: "M/d".to_string(),
        })),
        ..FormatDefaults::default()
    };
    let ctx = FormatContext {
        defaults: Some(&d),
        named: None,
        currency: None,
    };
    let n =
        format_value(&json!(5), Some(&spec(FieldType::Number)), None, ctx, &pack).expect("format");
    assert_eq!((n.text.as_str(), n.warning), ("5", None));
    let p = format_value(
        &json!(0.1),
        Some(&spec(FieldType::Percentage)),
        None,
        ctx,
        &pack,
    )
    .expect("format");
    assert_eq!(p.text, "10%");
    assert_eq!(
        p.warning,
        Some(FormatWarning::UnknownVariant("fancy".into()))
    );
    let q = format_value(
        &json!(2),
        Some(&spec(FieldType::Quantity)),
        None,
        ctx,
        &pack,
    )
    .expect("format");
    assert_eq!(q.text, "2点");
    assert_eq!(q.warning, Some(FormatWarning::IgnoredPattern));
}

#[test]
fn string_fields_ignore_template_defaults() {
    let pack = ja_pack();
    let d = defaults(FormatRef::Name("wareki".to_string()));
    let ctx = FormatContext {
        defaults: Some(&d),
        named: None,
        currency: None,
    };
    let out = format_value(
        &json!("text"),
        Some(&spec(FieldType::String)),
        None,
        ctx,
        &pack,
    )
    .expect("format");
    assert_eq!(out.text, "text");
}
