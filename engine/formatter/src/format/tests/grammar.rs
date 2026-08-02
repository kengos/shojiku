//! Pattern grammar: CLDR quoting, month/weekday names, the
//! 12-hour clock, and the compact era token — locale goldens run against
//! the real builtin packs.

use super::*;

fn dt() -> Value {
    json!("2026-07-05T20:00:30+09:00")
}

#[test]
fn builtin_en_default_uses_month_names_and_12_hour_clock() {
    // 2026-07-05 20:00 — the real CLDR shape the old grammar could not
    // express (`MMM d, y, h:mm a`).
    let pack = builtin_en();
    let out = fmt(&dt(), Some(&spec(FieldType::Datetime)), None, &pack);
    assert_eq!(out, "Jul 5, 2026, 8:00 PM");
}

#[test]
fn builtin_en_long_spells_everything_out() {
    let pack = builtin_en();
    let out = fmt(&dt(), Some(&spec(FieldType::Date)), Some("long"), &pack);
    assert_eq!(out, "Sunday, July 5, 2026");
}

#[test]
fn quoted_literals_pass_through_including_token_letters() {
    let pack =
        LangPack::from_yaml_str("id: xx-XX\ndateFormats:\n  default: \"'year' y 'at' HH:mm\"\n")
            .expect("pack");
    let out = fmt(&dt(), Some(&spec(FieldType::Datetime)), None, &pack);
    assert_eq!(out, "year 2026 at 20:00");
}

#[test]
fn doubled_apostrophe_is_a_literal_apostrophe() {
    let pack = LangPack::from_yaml_str("id: xx-XX\ndateFormats:\n  default: \"d o''clock\"\n")
        .expect("pack");
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        None,
        &pack,
    );
    assert_eq!(out, "5 o'clock");
}

#[test]
fn unterminated_quote_runs_to_the_end_without_failing() {
    // Hostile pack/template patterns must degrade, never error.
    let pack = LangPack::from_yaml_str("id: xx-XX\ndateFormats:\n  default: \"y 'unclosed M\"\n")
        .expect("pack");
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        None,
        &pack,
    );
    assert_eq!(out, "2026 unclosed M");
}

#[test]
fn twelve_hour_clock_edges() {
    let pack = LangPack::from_yaml_str(
        "id: xx-XX\ndatetimeFormats:\n  default: \"h:mm a\"\ndayPeriods: [\"午前\", \"午後\"]\n",
    )
    .expect("pack");
    let s = spec(FieldType::Datetime);
    // Midnight is 12 AM, noon 12 PM (CLDR h).
    assert_eq!(
        fmt(&json!("2026-07-05T00:05:00+09:00"), Some(&s), None, &pack),
        "12:05 午前"
    );
    assert_eq!(
        fmt(&json!("2026-07-05T12:30:00+09:00"), Some(&s), None, &pack),
        "12:30 午後"
    );
    assert_eq!(
        fmt(&json!("2026-07-05T13:00:00+09:00"), Some(&s), None, &pack),
        "1:00 午後"
    );
}

#[test]
fn padded_twelve_hour_token() {
    let pack = LangPack::from_yaml_str("id: xx-XX\ndatetimeFormats:\n  default: \"hh:mm a\"\n")
        .expect("pack");
    let out = fmt(
        &json!("2026-07-05T13:00:00+09:00"),
        Some(&spec(FieldType::Datetime)),
        None,
        &pack,
    );
    assert_eq!(out, "01:00 PM");
}

#[test]
fn compact_era_token_uses_the_abbreviation() {
    // The builtin ja pack ships `wareki-compact: GGy.M.d` (R8.7.5).
    let pack = builtin_ja();
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        Some("wareki-compact"),
        &pack,
    );
    assert_eq!(out, "R8.7.5");
}

#[test]
fn compact_era_token_falls_back_to_the_name_without_abbr() {
    // The hand-written pack's 昭和 entry has no abbr.
    let pack = ja_pack();
    let custom = LangPack::from_yaml_str(
        "id: xx-XX\ndateFormats:\n  default: \"GGy年\"\neras:\n  - { name: 昭和, start: \"1926-12-25\" }\n",
    )
    .expect("pack");
    let out = fmt(
        &json!("1980-01-01"),
        Some(&spec(FieldType::Date)),
        None,
        &custom,
    );
    assert_eq!(out, "昭和55年");
    // And with an abbr the compact form is used.
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        Some("wareki"),
        &pack,
    );
    assert_eq!(out, "令和8年7月5日");
}

#[test]
fn compact_era_token_without_any_era_renders_empty() {
    let pack =
        LangPack::from_yaml_str("id: xx-XX\ndateFormats:\n  default: \"GGy\"\n").expect("pack");
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        None,
        &pack,
    );
    assert_eq!(out, "2026");
}

#[test]
fn month_and_weekday_names_fall_back_across_lists() {
    // A pack with only long month names still renders MMM (falls back to
    // the other list); missing both falls back to the number.
    let pack = LangPack::from_yaml_str(
        "id: xx-XX\ndateFormats:\n  default: \"MMM d (EEEE)\"\nmonthsLong: [\"睦月\", \"如月\", \"弥生\", \"卯月\", \"皐月\", \"水無月\", \"文月\", \"葉月\", \"長月\", \"神無月\", \"霜月\", \"師走\"]\n",
    )
    .expect("pack");
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        None,
        &pack,
    );
    // EEEE falls back to the SHORT list when no long names exist.
    assert_eq!(out, "文月 5 (Sun)");
    let bare =
        LangPack::from_yaml_str("id: xx-XX\ndateFormats:\n  default: \"MMMM/d\"\n").expect("pack");
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        None,
        &bare,
    );
    assert_eq!(out, "7/5");
}

#[test]
fn builtin_ja_goldens_are_stable() {
    // Golden set per agents/lang.md: date, datetime, currency, quantity,
    // percentage against the compiled ja-JP pack.
    let pack = builtin_ja();
    assert_eq!(
        fmt(
            &json!("2026-07-05"),
            Some(&spec(FieldType::Date)),
            None,
            &pack
        ),
        "2026/07/05(日)"
    );
    assert_eq!(
        fmt(&dt(), Some(&spec(FieldType::Datetime)), Some("long"), &pack),
        "2026年7月5日(日) 20:00"
    );
    let mut money = spec(FieldType::Currency);
    money.currency = Some("JPY".to_string());
    assert_eq!(
        fmt(&json!(9000), Some(&money), Some("symbol"), &pack),
        "¥9,000"
    );
    assert_eq!(
        fmt(&json!(9000), Some(&money), Some("name"), &pack),
        "9,000円"
    );
    assert_eq!(
        fmt(&json!(3), Some(&spec(FieldType::Quantity)), None, &pack),
        "3点"
    );
    assert_eq!(
        fmt(&json!(0.1), Some(&spec(FieldType::Percentage)), None, &pack),
        "10%"
    );
}

#[test]
fn builtin_en_money_goldens() {
    let pack = builtin_en();
    let s = spec(FieldType::Currency);
    assert_eq!(fmt(&json!(1234.5), Some(&s), None, &pack), "1,234.50");
    assert_eq!(
        fmt(&json!(1234.5), Some(&s), Some("symbol"), &pack),
        "$1,234.50"
    );
    assert_eq!(
        fmt(&json!(1234.5), Some(&s), Some("name"), &pack),
        "1,234.50 US dollars"
    );
    // JOD: the 3-fraction-digit case straight from the shared table.
    let mut jod = spec(FieldType::Currency);
    jod.currency = Some("JOD".to_string());
    assert_eq!(
        fmt(&json!(5), Some(&jod), Some("symbol"), &pack),
        "JOD 5.000"
    );
}
