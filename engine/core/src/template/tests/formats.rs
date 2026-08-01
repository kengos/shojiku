//! Presentation-defaults wire tests: `defaults:` + the `formats:` registry — parse,
//! typo safety, and authored-form round-trips.

use super::*;

#[test]
fn defaults_block_parses_name_and_inline_forms() {
    let tpl = parse_template(
        r#"
defaults:
  style: { fontSize: 12 }
  formats:
    date: wareki
    datetime: { pattern: "yyyy-MM-dd HH:mm" }
    currency: symbol
sections:
  body: { type: absolute }
"#,
    )
    .expect("template");
    let formats = tpl.defaults.formats.as_ref().expect("formats");
    assert_eq!(formats.date, Some(FormatRef::Name("wareki".into())));
    assert_eq!(
        formats.datetime,
        Some(FormatRef::Inline(InlineFormat {
            pattern: "yyyy-MM-dd HH:mm".into()
        }))
    );
    assert_eq!(formats.currency, Some(FormatRef::Name("symbol".into())));
    assert!(tpl.defaults.style.is_some());
}

#[test]
fn defaults_document_locale_and_currency_parse_and_round_trip() {
    // The document locale + currency now live in `defaults:`.
    let src =
        "defaults:\n  locale: en-US\n  currency: USD\nsections:\n  body: { type: absolute }\n";
    let tpl = parse_template(src).expect("template");
    assert_eq!(tpl.defaults.locale.as_deref(), Some("en-US"));
    assert_eq!(tpl.defaults.currency.as_deref(), Some("USD"));
    assert!(!tpl.defaults.is_empty());

    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(yaml.contains("locale: en-US"), "got: {yaml}");
    assert!(yaml.contains("currency: USD"), "got: {yaml}");
}

#[test]
fn unset_document_defaults_stay_empty_and_do_not_serialize() {
    let tpl = parse_template("sections:\n  body: { type: absolute }\n").expect("template");
    assert!(tpl.defaults.is_empty());
    assert!(tpl.defaults.locale.is_none());
    assert!(tpl.defaults.currency.is_none());
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(!yaml.contains("locale"), "injected: {yaml}");
    assert!(!yaml.contains("currency"), "injected: {yaml}");
}

#[test]
fn formats_registry_parses_and_rejects_unknown_keys() {
    let tpl = parse_template(
        "formats:\n  stamp: { type: date, pattern: \"yyyy.MM.dd\" }\nsections:\n  body: { type: absolute }\n",
    )
    .expect("template");
    assert_eq!(tpl.formats["stamp"].kind, NamedFormatKind::Date);
    assert_eq!(tpl.formats["stamp"].pattern, "yyyy.MM.dd");

    // deny_unknown_fields at every level.
    for bad in [
        "defaults:\n  zzz: 1\nsections:\n  body: { type: absolute }\n",
        "defaults:\n  formats:\n    zzz: x\nsections:\n  body: { type: absolute }\n",
        "defaults:\n  formats:\n    date: { zzz: x }\nsections:\n  body: { type: absolute }\n",
        "formats:\n  s: { type: date, pattern: p, zzz: 1 }\nsections:\n  body: { type: absolute }\n",
        "formats:\n  s: { type: zzz, pattern: p }\nsections:\n  body: { type: absolute }\n",
    ] {
        assert!(parse_template(bad).is_err(), "expected rejection: {bad}");
    }
}

#[test]
fn unset_defaults_and_formats_never_serialize() {
    let tpl = parse_template("sections:\n  body: { type: absolute }\n").expect("template");
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(!yaml.contains("defaults"), "injected: {yaml}");
    assert!(!yaml.contains("formats"), "injected: {yaml}");
}

#[test]
fn defaults_round_trip_their_authored_form() {
    let src = "defaults:\n  formats:\n    date: wareki\n    datetime: { pattern: yyyy-MM-dd }\nsections:\n  body: { type: absolute }\n";
    let tpl = parse_template(src).expect("template");
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    // Name stays a bare string; inline stays a pattern map; untouched
    // type slots never appear.
    assert!(yaml.contains("date: wareki"), "got: {yaml}");
    assert!(yaml.contains("pattern: yyyy-MM-dd"), "got: {yaml}");
    assert!(!yaml.contains("currency"), "injected: {yaml}");
}
