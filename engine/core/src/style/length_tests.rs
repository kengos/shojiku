//! Unit tests for font lengths (U1): `fontSize`/`letterSpacing` as
//! `Length` strings (em/rem/`%`/physical), the letterSpacing `%`
//! rejection, and authored-form round-trips.

use super::*;
use crate::length::PhysicalUnit;

#[test]
fn font_size_takes_every_length_unit() {
    let s: Style = serde_yaml::from_str(
        "{ fontSize: \"1.2em\" }
",
    )
    .expect("em");
    assert_eq!(s.font_size, Some(Length::Em(1.2)));
    let s: Style = serde_yaml::from_str("fontSize: \"1.5rem\"").expect("rem");
    assert_eq!(s.font_size, Some(Length::Rem(1.5)));
    let s: Style = serde_yaml::from_str("fontSize: \"120%\"").expect("pct");
    assert_eq!(s.font_size, Some(Length::Percent(120.0)));
    let s: Style = serde_yaml::from_str("fontSize: \"3mm\"").expect("mm");
    assert_eq!(s.font_size, Some(Length::Physical(3.0, PhysicalUnit::Mm)));
}

#[test]
fn letter_spacing_takes_em_and_rem() {
    let s: Style = serde_yaml::from_str("letterSpacing: \"0.1em\"").expect("em");
    assert_eq!(s.letter_spacing, Some(Length::Em(0.1)));
    let s: Style = serde_yaml::from_str("letterSpacing: \"0.2rem\"").expect("rem");
    assert_eq!(s.letter_spacing, Some(Length::Rem(0.2)));
}

#[test]
fn letter_spacing_rejects_percent_at_parse() {
    // CSS letter-spacing has no percentage form; a parse error beats
    // silently misresolving the value.
    let err = serde_yaml::from_str::<Style>("letterSpacing: \"10%\"")
        .expect_err("rejected")
        .to_string();
    assert!(
        err.contains("letterSpacing does not take `%`"),
        "got: {err}"
    );
}

#[test]
fn font_lengths_round_trip_their_authored_form() {
    // Bare numbers stay bare (wire back-compat); unit strings keep
    // their unit.
    for (yaml, expected) in [
        ("fontSize: 12", "fontSize: 12.0"),
        ("fontSize: \"1.2em\"", "fontSize: 1.2em"),
        ("letterSpacing: \"0.1em\"", "letterSpacing: 0.1em"),
        ("letterSpacing: -0.5", "letterSpacing: -0.5"),
    ] {
        let s: Style = serde_yaml::from_str(yaml).expect("parse");
        let out = serde_yaml::to_string(&s).expect("yaml");
        assert!(out.contains(expected), "{yaml} serialized to: {out}");
    }
}
