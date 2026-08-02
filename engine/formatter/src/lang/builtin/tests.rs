//! Builtin packs: id matching, every embedded YAML parses, overlay merge.

use super::*;

#[test]
fn every_builtin_yaml_parses_and_ids_agree() {
    // The public id list and the embedded YAML table must stay in sync —
    // `builtin_yaml` matches over BUILTIN_YAML, capabilities/errors show
    // BUILTIN_LOCALE_IDS.
    assert_eq!(&BUILTIN_YAML.map(|(id, _)| id)[..], BUILTIN_LOCALE_IDS);
    for id in BUILTIN_LOCALE_IDS {
        let pack = LangPack::builtin(id, None)
            .expect("parse")
            .expect("builtin exists");
        assert_eq!(&pack.id, id);
        assert!(pack.default_font().is_some(), "{id} declares fonts");
    }
}

#[test]
fn ja_builtin_carries_eras_and_wareki_formats() {
    let pack = LangPack::builtin("ja-JP", None)
        .expect("parse")
        .expect("ja");
    assert_eq!(pack.eras.len(), 5);
    assert_eq!(pack.eras[4].name, "令和");
    assert_eq!(pack.era_year_one.as_deref(), Some("元"));
    assert!(pack.date_formats.contains_key("wareki"));
    assert!(pack.datetime_formats.contains_key("wareki"));
    assert_eq!(pack.currency.get("JPY").expect("JPY").symbol, "¥");
}

#[test]
fn en_builtin_has_no_eras() {
    let pack = LangPack::builtin("en-US", None)
        .expect("parse")
        .expect("en");
    assert!(pack.eras.is_empty());
    assert!(pack.era_year_one.is_none());
    assert_eq!(pack.currency_default.as_deref(), Some("USD"));
}

#[test]
fn matching_is_case_insensitive_and_prefix_aware() {
    assert_eq!(canonical_id("ja-JP", BUILTIN_LOCALE_IDS), Some("ja-JP"));
    assert_eq!(canonical_id("JA-jp", BUILTIN_LOCALE_IDS), Some("ja-JP"));
    assert_eq!(canonical_id("ja", BUILTIN_LOCALE_IDS), Some("ja-JP"));
    assert_eq!(canonical_id("en", BUILTIN_LOCALE_IDS), Some("en-US"));
    assert_eq!(canonical_id("fr", BUILTIN_LOCALE_IDS), None);
    assert_eq!(canonical_id("ja-JP-x", BUILTIN_LOCALE_IDS), None);
}

#[test]
fn ambiguous_prefix_matches_nothing() {
    let ids: &[&'static str] = &["zh-CN", "zh-TW"];
    assert_eq!(canonical_id("zh", ids), None);
    assert_eq!(canonical_id("zh-TW", ids), Some("zh-TW"));
    // The empty id prefixes everything → ambiguous → none.
    assert_eq!(canonical_id("", ids), None);
}

#[test]
fn unknown_locale_is_ok_none_without_parsing_the_overlay() {
    let r = LangPack::builtin("fr-FR", Some(": not yaml: [")).expect("no builtin");
    assert!(r.is_none());
}

#[test]
fn overlay_merges_per_key_keeping_siblings() {
    let overlay = r#"
currency:
  JPY:
    symbol: "円"
dateFormats:
  stamp: "yyyyMMdd"
"#;
    let pack = LangPack::builtin("ja-JP", Some(overlay))
        .expect("merge")
        .expect("ja");
    // Overridden key.
    assert_eq!(pack.currency.get("JPY").expect("JPY").symbol, "円");
    // Sibling keys of the overridden mapping survive.
    assert_eq!(
        pack.currency.get("JPY").expect("JPY").name.as_deref(),
        Some("円")
    );
    assert_eq!(pack.currency.get("USD").expect("USD").symbol, "$");
    // Added key joins the builtin ones.
    assert_eq!(pack.date_formats.get("stamp").expect("added"), "yyyyMMdd");
    assert!(pack.date_formats.contains_key("wareki"));
}

#[test]
fn overlay_sequences_replace_wholesale() {
    let pack = LangPack::builtin("ja-JP", Some("weekdaysShort: [S, M, T, W, T2, F, S2]"))
        .expect("merge")
        .expect("ja");
    assert_eq!(pack.weekdays_short[0], "S");
    assert_eq!(pack.weekdays_short.len(), 7);
}

#[test]
fn overlay_null_overwrites_a_scalar() {
    let pack = LangPack::builtin("ja-JP", Some("currencyDefault: null"))
        .expect("merge")
        .expect("ja");
    assert!(pack.currency_default.is_none());
}

#[test]
fn invalid_overlay_yaml_is_a_parse_error() {
    let r = LangPack::builtin("ja-JP", Some(": not yaml: ["));
    assert!(matches!(r, Err(LangPackError::Parse(_))));
}

#[test]
fn overlay_with_wrong_shape_is_a_parse_error() {
    // Replaces the whole `currency` mapping with a scalar: merge succeeds
    // (scalar replaces), deserialization then rejects the shape.
    let r = LangPack::builtin("ja-JP", Some("currency: 5"));
    assert!(matches!(r, Err(LangPackError::Parse(_))));
}

#[test]
fn non_mapping_overlay_root_replaces_and_fails_shape() {
    let r = LangPack::builtin("ja-JP", Some("just-a-string"));
    assert!(matches!(r, Err(LangPackError::Parse(_))));
}
