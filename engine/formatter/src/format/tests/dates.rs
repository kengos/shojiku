//! Date/datetime formatting, inference, and error inputs.

use super::*;

#[test]
fn formats_datetime_ja_variant() {
    // 2026-07-05 is a Sunday.
    let pack = ja_pack();
    let out = fmt(
        &json!("2026-07-05T20:00:30+09:00"),
        Some(&spec(FieldType::Datetime)),
        Some("ja"),
        &pack,
    );
    assert_eq!(out, "2026年7月5日(日) 20:00");
}

#[test]
fn formats_datetime_default_variant() {
    let pack = ja_pack();
    let out = fmt(
        &json!("2026-07-05T20:00:30+09:00"),
        Some(&spec(FieldType::Datetime)),
        None,
        &pack,
    );
    assert_eq!(out, "2026/07/05(日) 20:00");
}

#[test]
fn formats_date_long() {
    let pack = ja_pack();
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        Some("long"),
        &pack,
    );
    assert_eq!(out, "2026年7月5日(日)");
}

#[test]
fn infers_datetime_from_rfc3339_string() {
    let pack = ja_pack();
    let out = fmt(&json!("2026-07-05T20:00:30+09:00"), None, None, &pack);
    assert_eq!(out, "2026/07/05(日) 20:00");
}

#[test]
fn type_override_via_variant() {
    let pack = ja_pack();
    // The currency default variant is the bare grouped amount;
    // the symbol form is an explicit pick.
    let out = fmt(&json!(5000), None, Some("currency"), &pack);
    assert_eq!(out, "5,000");
}

#[test]
fn infers_plain_date_strings() {
    let pack = ja_pack();
    let out = fmt(&json!("2026-07-05"), None, None, &pack);
    assert_eq!(out, "2026/07/05(日)");
}

#[test]
fn malformed_date_strings_are_errors_for_date_type() {
    let pack = ja_pack();
    // Four dash-separated parts: rejected by the simple-date parser.
    let result = format_value(
        &json!("2026-07-05-9"),
        Some(&spec(FieldType::Date)),
        None,
        FormatContext::default(),
        &pack,
    );
    assert!(result.is_err());
    // Month out of range.
    let result = format_value(
        &json!("2026-13-05"),
        Some(&spec(FieldType::Date)),
        None,
        FormatContext::default(),
        &pack,
    );
    assert!(result.is_err());
}

#[test]
fn non_string_datetime_value_is_an_error() {
    let pack = ja_pack();
    let result = format_value(
        &json!(7),
        Some(&spec(FieldType::Datetime)),
        None,
        FormatContext::default(),
        &pack,
    );
    assert!(matches!(result, Err(FormatError::InvalidDatetime(ref s)) if s == "7"));
}

#[test]
fn unknown_datetime_variant_falls_back_to_default_with_a_warning() {
    let pack = ja_pack();
    let out = fmt_warn(
        &json!("2026-07-05T20:00:30+09:00"),
        Some(&spec(FieldType::Datetime)),
        Some("nope"),
        &pack,
    );
    assert_eq!(out.text, "2026/07/05(日) 20:00");
    assert_eq!(
        out.warning,
        Some(FormatWarning::UnknownVariant("nope".into()))
    );
}

#[test]
fn datetime_pattern_falls_back_to_date_formats() {
    // A pack with no datetimeFormats at all: the datetime formatter
    // borrows the date pattern rather than failing.
    let pack = LangPack::from_yaml_str(
        r#"
id: xx-XX
dateFormats:
  default: "yyyy/MM/dd"
"#,
    )
    .expect("pack");
    let out = fmt(
        &json!("2026-07-05T20:00:30+09:00"),
        Some(&spec(FieldType::Datetime)),
        None,
        &pack,
    );
    assert_eq!(out, "2026/07/05");
}

#[test]
fn unknown_pattern_token_renders_literally() {
    use time::format_description::well_known::Rfc3339;
    let pack = ja_pack();
    let odt = time::OffsetDateTime::parse("2026-07-05T20:00:30+09:00", &Rfc3339).expect("datetime");
    assert_eq!(datetime::render_token("Q", &odt, &pack), "Q");
}

#[test]
fn weekday_name_falls_back_when_pack_list_is_short() {
    // 2026-07-06 is a Monday; a one-entry weekday list forces the
    // English fallback.
    let mut pack = ja_pack();
    pack.weekdays_short = vec!["日".to_string()];
    let out = fmt(
        &json!("2026-07-06"),
        Some(&spec(FieldType::Date)),
        None,
        &pack,
    );
    assert_eq!(out, "2026/07/06(Monday)");
}

#[test]
fn wareki_date_renders_era_and_year() {
    let pack = ja_pack();
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        Some("wareki"),
        &pack,
    );
    assert_eq!(out, "令和8年7月5日");
}

#[test]
fn wareki_first_year_renders_gannen() {
    let pack = ja_pack();
    let out = fmt(
        &json!("2019-05-05"),
        Some(&spec(FieldType::Date)),
        Some("wareki"),
        &pack,
    );
    assert_eq!(out, "令和元年5月5日");
}

#[test]
fn wareki_era_boundary_stays_in_the_previous_era() {
    let pack = ja_pack();
    let out = fmt(
        &json!("2019-04-30"),
        Some(&spec(FieldType::Date)),
        Some("wareki"),
        &pack,
    );
    assert_eq!(out, "平成31年4月30日");
}

#[test]
fn wareki_before_every_era_falls_back_to_gregorian_year() {
    let pack = ja_pack();
    let out = fmt(
        &json!("1868-10-22"),
        Some(&spec(FieldType::Date)),
        Some("wareki"),
        &pack,
    );
    assert_eq!(out, "1868年10月22日");
}

#[test]
fn wareki_datetime_variant_keeps_the_time() {
    let pack = ja_pack();
    let out = fmt(
        &json!("2026-07-05T20:00:30+09:00"),
        Some(&spec(FieldType::Datetime)),
        Some("wareki"),
        &pack,
    );
    assert_eq!(out, "令和8年7月5日 20:00");
}

#[test]
fn era_tokens_without_eras_render_empty_and_gregorian() {
    // A pack with G/y in a pattern but no era table: G disappears, y
    // falls back to the Gregorian year.
    let pack = LangPack::from_yaml_str(
        r#"
id: xx-XX
dateFormats:
  default: "Gy/M/d"
"#,
    )
    .expect("pack");
    let out = fmt(
        &json!("2026-07-05"),
        Some(&spec(FieldType::Date)),
        None,
        &pack,
    );
    assert_eq!(out, "2026/7/5");
}

#[test]
fn era_year_one_without_display_override_renders_1() {
    let pack = LangPack::from_yaml_str(
        r#"
id: xx-XX
dateFormats:
  default: "Gy年"
eras:
  - { name: 令和, start: "2019-05-01" }
"#,
    )
    .expect("pack");
    let out = fmt(
        &json!("2019-06-01"),
        Some(&spec(FieldType::Date)),
        None,
        &pack,
    );
    assert_eq!(out, "令和1年");
}

#[test]
fn invalid_datetime_is_error() {
    let pack = ja_pack();
    let result = format_value(
        &json!("not-a-date"),
        Some(&spec(FieldType::Datetime)),
        None,
        FormatContext::default(),
        &pack,
    );
    assert!(result.is_err());
}

#[test]
fn a_hostile_datetime_value_never_crowds_out_the_reason() {
    // `format_error`'s template is `` `{key}`: {detail}`` — the key survives on
    // its own arg, but the detail carries the whole FormatError message, and
    // that message quotes a params value the document chose.
    let hostile = "9".repeat(10_000);
    let err = super::super::datetime::parse_datetime(&json!(hostile)).unwrap_err();
    let message = err.to_string();
    assert!(
        message.ends_with("is not a valid datetime (RFC 3339 expected)"),
        "the reason was crowded out: {message:?}"
    );
    assert!(
        message.chars().count() <= shojiku_diagnostics::MAX_ECHO,
        "the detail will be clipped at the arg cap ({} chars)",
        message.chars().count()
    );
    assert!(!message.chars().any(char::is_control));
}
