//! Near-e2e goldens for the SHIPPED locale packs (`packs/locale/*.yml`).
//!
//! The builtin packs (ja-JP / en-US) are covered by the formatter's own unit
//! tests against `LangPack::builtin`. These locales have no builtin: their file
//! IS the whole pack, so this suite loads the real repo file and pins what a
//! document renders under it. A regenerated pack that drifts from the wire — or
//! silently loses a currency/date table — reds here.

use serde_json::{json, Value};
use shojiku_core::{FieldSpec, FieldType};
use shojiku_formatter::{format_value, FormatContext, LangPack};
use std::path::PathBuf;

/// Load a shipped pack exactly as a host does: read the file, parse it as a
/// whole pack. Also pins the declared `id` — a pack whose id drifts from its
/// file name would never resolve for the tag the file name promises.
fn shipped(id: &str) -> LangPack {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packs/locale")
        .join(format!("{}.yml", id.to_lowercase()));
    let text =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    let pack =
        LangPack::from_yaml_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()));
    assert_eq!(pack.id, id, "{} declares a mismatched id", path.display());
    pack
}

fn spec(field_type: FieldType) -> FieldSpec {
    FieldSpec {
        field_type,
        currency: None,
        precision: None,
        unit: None,
        format: None,
        formats: vec![],
        placeholder: None,
        enum_labels: vec![],
    }
}

/// Format asserting no degradation warning — a shipped pack must carry every
/// table these goldens touch, never fall back.
fn fmt(value: &Value, spec: Option<&FieldSpec>, variant: Option<&str>, pack: &LangPack) -> String {
    let out = format_value(value, spec, variant, FormatContext::default(), pack).expect("format");
    assert_eq!(out.warning, None, "unexpected warning for {value}");
    out.text
}

fn currency_spec(code: &str) -> FieldSpec {
    FieldSpec {
        currency: Some(code.to_string()),
        ..spec(FieldType::Currency)
    }
}

fn quantity_spec() -> FieldSpec {
    FieldSpec {
        unit: Some("item".to_string()),
        ..spec(FieldType::Quantity)
    }
}

// 2026-03-14 is a Saturday — every date golden below uses it, so the weekday
// tables are exercised, not just the numerals.
const DAY: &str = "2026-03-14";

#[test]
fn zh_tw_renders_taiwanese_chrome() {
    let pack = shipped("zh-TW");
    assert_eq!(pack.currency_default.as_deref(), Some("TWD"));

    // CLDR is authoritative: inside a Taiwanese document `$` IS the local
    // dollar, exactly as `$` is USD inside an American one.
    let twd = currency_spec("TWD");
    assert_eq!(
        fmt(&json!(3990), Some(&twd), Some("symbol"), &pack),
        "$3,990.00"
    );
    assert_eq!(
        fmt(&json!(3990), Some(&twd), Some("name"), &pack),
        "3,990.00 新台幣"
    );
    assert_eq!(
        fmt(&json!(-1234567.5), Some(&twd), Some("symbol"), &pack),
        "-$1,234,567.50"
    );

    let date = spec(FieldType::Date);
    assert_eq!(fmt(&json!(DAY), Some(&date), None, &pack), "2026年3月14日");
    assert_eq!(
        fmt(&json!(DAY), Some(&date), Some("long"), &pack),
        "2026年3月14日 星期六"
    );
    assert_eq!(
        fmt(&json!(DAY), Some(&date), Some("compact"), &pack),
        "2026/3/14"
    );

    assert_eq!(fmt(&json!(3), Some(&quantity_spec()), None, &pack), "3項");
}

#[test]
fn zh_cn_renders_mainland_chrome_distinct_from_tw() {
    let pack = shipped("zh-CN");
    assert_eq!(pack.currency_default.as_deref(), Some("CNY"));

    let cny = currency_spec("CNY");
    assert_eq!(
        fmt(&json!(848), Some(&cny), Some("symbol"), &pack),
        "¥848.00"
    );
    assert_eq!(
        fmt(&json!(848), Some(&cny), Some("name"), &pack),
        "848.00 人民币"
    );

    let date = spec(FieldType::Date);
    assert_eq!(fmt(&json!(DAY), Some(&date), None, &pack), "2026年3月14日");
    // zh-Hans joins the weekday with no space; zh-Hant separates it.
    assert_eq!(
        fmt(&json!(DAY), Some(&date), Some("long"), &pack),
        "2026年3月14日星期六"
    );

    // Simplified forms, not Traditional: the two packs are not interchangeable.
    assert_eq!(fmt(&json!(3), Some(&quantity_spec()), None, &pack), "3项");
}

#[test]
fn hi_in_renders_devanagari_chrome() {
    let pack = shipped("hi-IN");
    assert_eq!(pack.currency_default.as_deref(), Some("INR"));

    let inr = currency_spec("INR");
    assert_eq!(
        fmt(&json!(1234.5), Some(&inr), Some("symbol"), &pack),
        "₹1,234.50"
    );
    assert_eq!(
        fmt(&json!(1234.5), Some(&inr), Some("name"), &pack),
        "1,234.50 भारतीय रुपए"
    );

    let date = spec(FieldType::Date);
    assert_eq!(fmt(&json!(DAY), Some(&date), None, &pack), "14 मार्च 2026");
    assert_eq!(
        fmt(&json!(DAY), Some(&date), Some("long"), &pack),
        "शनिवार, 14 मार्च 2026"
    );

    assert_eq!(
        fmt(&json!(3), Some(&quantity_spec()), None, &pack),
        "3 आइटम"
    );
}

#[test]
fn hi_in_groups_the_indian_way_from_the_shipped_pack() {
    // The pack declares CLDR hi's `#,##,##0` sizes (groupSize 3 +
    // secondaryGroupSize 2), so lakh/crore positions come out of the SHIPPED
    // file — not a synthetic spec. 1234567 = 12 lakh 34 thousand 567.
    let pack = shipped("hi-IN");
    let out = fmt(
        &json!(1234567),
        Some(&currency_spec("INR")),
        Some("symbol"),
        &pack,
    );
    assert_eq!(out, "₹12,34,567.00");
    // A crore-scale amount crosses two secondary groups.
    let big = fmt(
        &json!(12345678),
        Some(&currency_spec("INR")),
        Some("symbol"),
        &pack,
    );
    assert_eq!(big, "₹1,23,45,678.00");
}

#[test]
fn fil_ph_renders_filipino_chrome_on_the_latin_font() {
    let pack = shipped("fil-PH");
    assert_eq!(pack.currency_default.as_deref(), Some("PHP"));

    let php = currency_spec("PHP");
    assert_eq!(
        fmt(&json!(1500), Some(&php), Some("symbol"), &pack),
        "₱1,500.00"
    );
    assert_eq!(
        fmt(&json!(1500), Some(&php), Some("name"), &pack),
        "1,500.00 piso ng Pilipinas"
    );

    let date = spec(FieldType::Date);
    assert_eq!(fmt(&json!(DAY), Some(&date), None, &pack), "Mar 14, 2026");
    assert_eq!(
        fmt(&json!(DAY), Some(&date), Some("long"), &pack),
        "Sabado, Marso 14, 2026"
    );

    // Filipino drops `mga` after a numeral, so the counted form does not inflect.
    assert_eq!(
        fmt(&json!(3), Some(&quantity_spec()), None, &pack),
        "3 item"
    );
}

#[test]
fn every_shipped_pack_formats_the_bare_default_variant_and_plain_numbers() {
    // The `default` currency variant is the bare amount (it composes with
    // literal text in the template), and a plain number shares the same
    // grouping/decimal path — every pack must carry both tables, so this
    // covers all four rather than repeating them per-locale test. The
    // 7-digit expectation is per-pack: hi-IN groups the Indian way, so a
    // shared golden here would either be wrong for it or hide the rule.
    for (id, code, bare) in [
        ("zh-TW", "TWD", "1,234,567.50"),
        ("zh-CN", "CNY", "1,234,567.50"),
        ("hi-IN", "INR", "12,34,567.50"),
        ("fil-PH", "PHP", "1,234,567.50"),
    ] {
        let pack = shipped(id);
        assert_eq!(
            fmt(&json!(1234567.5), Some(&currency_spec(code)), None, &pack),
            bare,
            "{id} bare currency"
        );
        assert_eq!(
            fmt(
                &json!(-1234.25),
                Some(&spec(FieldType::Number)),
                None,
                &pack
            ),
            "-1,234.25",
            "{id} negative number"
        );
        // A percentage field carries the FRACTION; the formatter scales it.
        assert_eq!(
            fmt(&json!(0.1), Some(&spec(FieldType::Percentage)), None, &pack),
            "10%",
            "{id} percentage"
        );
    }
}

#[test]
fn every_shipped_pack_declares_its_fonts() {
    // A pack whose `fonts` block is missing/misspelled would degrade every
    // glyph to `missing_glyph` at render — cheaper to catch here.
    for id in ["zh-TW", "zh-CN", "hi-IN", "fil-PH"] {
        let pack = shipped(id);
        assert!(
            !pack.font_pack_ids().is_empty(),
            "{id} declares no font packs"
        );
        assert!(
            pack.default_font().is_some(),
            "{id} declares no default font"
        );
    }
}
