//! Era wire parsing + lookup: boundaries, year-one, hostile dates.

use super::*;

fn eras() -> Vec<EraSpec> {
    serde_yaml::from_str(
        r#"
- { name: 平成, start: "1989-01-08" }
- { name: 令和, start: "2019-05-01" }
- { name: 昭和, start: "1926-12-25" }
"#,
    )
    .expect("eras")
}

fn day(year: i32, month: u8, day: u8) -> EraDate {
    EraDate { year, month, day }
}

#[test]
fn picks_latest_era_at_or_before_the_date_unsorted() {
    let eras = eras();
    let (era, year) = era_for(&eras, day(2026, 7, 10)).expect("era");
    assert_eq!(era.name, "令和");
    assert_eq!(year, 8);
}

#[test]
fn era_start_day_is_year_one() {
    let eras = eras();
    let (era, year) = era_for(&eras, day(2019, 5, 1)).expect("era");
    assert_eq!((era.name.as_str(), year), ("令和", 1));
}

#[test]
fn day_before_a_start_belongs_to_the_previous_era() {
    let eras = eras();
    let (era, year) = era_for(&eras, day(2019, 4, 30)).expect("era");
    assert_eq!((era.name.as_str(), year), ("平成", 31));
}

#[test]
fn date_before_every_era_has_none() {
    assert!(era_for(&eras(), day(1900, 1, 1)).is_none());
}

#[test]
fn empty_era_list_has_none() {
    assert!(era_for(&[], day(2026, 1, 1)).is_none());
}

#[test]
fn far_future_date_does_not_overflow() {
    let eras = eras();
    let (era, year) = era_for(&eras, day(9999, 12, 31)).expect("era");
    assert_eq!((era.name.as_str(), year), ("令和", 7981));
}

#[test]
fn era_date_round_trips_zero_padded() {
    let d: EraDate = serde_yaml::from_str("\"1989-01-08\"").expect("date");
    assert_eq!(d, day(1989, 1, 8));
    assert_eq!(
        serde_yaml::to_string(&d).expect("yaml").trim(),
        "1989-01-08"
    );
}

#[test]
fn an_era_may_start_before_year_one() {
    // The Buddhist era: CLDR writes its start `-542-01-01`, and the plain
    // subtraction in `era_for` then yields the Buddhist year.
    let d: EraDate = serde_yaml::from_str("\"-542-01-01\"").expect("date");
    assert_eq!(d, day(-542, 1, 1));
    let eras: Vec<EraSpec> =
        serde_yaml::from_str("- { name: พุทธศักราช, abbr: พ.ศ., start: \"-542-01-01\" }")
            .expect("eras");
    let (era, year) = era_for(&eras, day(2026, 1, 5)).expect("era");
    assert_eq!((era.abbr.as_deref(), year), (Some("พ.ศ."), 2569));
}

#[test]
fn a_negative_era_date_round_trips() {
    // `{:04}` counts the sign in its width, so the emitted form is the one
    // CLDR authors and re-parses to the same value.
    let d: EraDate = serde_yaml::from_str("\"-542-01-01\"").expect("date");
    let text = serde_yaml::to_string(&d).expect("yaml");
    assert_eq!(text.trim(), "-542-01-01");
    let back: EraDate = serde_yaml::from_str(text.trim()).expect("reparse");
    assert_eq!(back, d);
}

#[test]
fn a_date_before_a_negative_era_start_still_has_none() {
    let eras: Vec<EraSpec> =
        serde_yaml::from_str("- { name: พุทธศักราช, start: \"-542-01-01\" }").expect("eras");
    assert!(era_for(&eras, day(-1000, 1, 1)).is_none());
}

#[test]
fn invalid_era_dates_are_parse_errors() {
    for bad in [
        "\"2019-5\"",           // missing day
        "\"2019-05-01-extra\"", // trailing part
        "\"2019-13-01\"",       // month out of range
        "\"2019-02-30\"",       // day not on the calendar
        "\"abcd-ef-gh\"",       // non-numeric
        "5",                    // not a string
        "\"--542-01-01\"",      // the sign is not a field of its own
        "\"-\"",                // a sign and nothing else
        "\"-542-01-01-\"",      // trailing separator after a signed year
        "\"-99999-01-01\"",     // outside the calendar's year range
        "\"-+542-01-01\"",      // a sign after the sign: one sign, one place
        "\"+542-01-01\"",       // and a bare `+` year is not the wire either
    ] {
        let r: Result<EraDate, _> = serde_yaml::from_str(bad);
        assert!(r.is_err(), "{bad} should be rejected");
    }
}

#[test]
fn hostile_era_date_echo_is_truncated() {
    let long = format!("\"{}\"", "9".repeat(500));
    let err = serde_yaml::from_str::<EraDate>(&long).expect_err("reject");
    assert!(err.to_string().len() < 200, "echo must be bounded");
}

#[test]
fn unknown_era_keys_are_rejected() {
    let r: Result<EraSpec, _> =
        serde_yaml::from_str("{ name: 令和, start: \"2019-05-01\", zzz: 1 }");
    assert!(r.is_err());
}

#[test]
fn an_era_date_echo_keeps_its_domain_cap_and_strips_controls() {
    // Same shape as the format-warning cap: an era start date is ten
    // characters, so 32 is generous, and the pack that supplies it is
    // untrusted input.
    let hostile = format!("\u{1b}[2J\u{7}{}", "9".repeat(500));
    let out = super::truncated(&hostile);
    assert!(!out.chars().any(char::is_control));
    assert_eq!(out.chars().count(), 33, "32 chars plus the marker");
}
