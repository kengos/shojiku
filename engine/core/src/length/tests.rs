//! Unit tests for `Length` parsing, resolution, and round-trip serialization.

use super::*;

fn parse(yaml: &str) -> Result<Length, serde_yaml::Error> {
    serde_yaml::from_str(yaml)
}

#[test]
fn bare_numbers_are_points() {
    assert_eq!(parse("25").expect("pt"), Length::Pt(25.0));
    assert_eq!(parse("-3.5").expect("pt"), Length::Pt(-3.5));
}

#[test]
fn percent_and_pt_strings_parse() {
    assert_eq!(parse("\"50%\"").expect("pct"), Length::Percent(50.0));
    assert_eq!(parse("\" -25.5% \"").expect("pct"), Length::Percent(-25.5));
    assert_eq!(parse("\"12pt\"").expect("pt"), Length::Pt(12.0));
}

#[test]
fn physical_unit_strings_parse() {
    assert_eq!(
        parse("\"80mm\"").expect("mm"),
        Length::Physical(80.0, PhysicalUnit::Mm)
    );
    assert_eq!(
        parse("\" 1.5cm \"").expect("cm"),
        Length::Physical(1.5, PhysicalUnit::Cm)
    );
    assert_eq!(
        parse("\"-1in\"").expect("in"),
        Length::Physical(-1.0, PhysicalUnit::In)
    );
}

#[test]
fn physical_units_resolve_to_pt_ignoring_basis() {
    let font = FontRel::default();
    let mm80 = Length::Physical(80.0, PhysicalUnit::Mm);
    assert!((mm80.resolve(500.0, font) - 226.771_653).abs() < 1e-6);
    let cm1 = Length::Physical(1.0, PhysicalUnit::Cm);
    assert!((cm1.resolve(0.0, font) - 28.346_456).abs() < 1e-6);
    assert_eq!(
        Length::Physical(2.0, PhysicalUnit::In).resolve(0.0, font),
        144.0
    );
}

#[test]
fn absolute_pt_is_none_for_percent_em_and_rem() {
    assert_eq!(Length::Pt(30.0).absolute_pt(), Some(30.0));
    assert_eq!(
        Length::Physical(1.0, PhysicalUnit::In).absolute_pt(),
        Some(72.0)
    );
    assert_eq!(Length::Percent(50.0).absolute_pt(), None);
    assert_eq!(Length::Em(1.0).absolute_pt(), None);
    assert_eq!(Length::Rem(1.0).absolute_pt(), None);
}

#[test]
fn em_and_rem_strings_parse() {
    assert_eq!(parse("\"1.2em\"").expect("em"), Length::Em(1.2));
    assert_eq!(parse("\" -0.5em \"").expect("em"), Length::Em(-0.5));
    // `rem` must win over the `em` suffix it also ends with.
    assert_eq!(parse("\"1.5rem\"").expect("rem"), Length::Rem(1.5));
    assert_eq!(parse("\"2rem\"").expect("rem"), Length::Rem(2.0));
}

#[test]
fn em_and_rem_resolve_against_their_font_bases() {
    let font = FontRel {
        em: 14.0,
        rem: 10.0,
    };
    // The geometric basis is ignored by font-relative lengths.
    assert_eq!(Length::Em(2.0).resolve(500.0, font), 28.0);
    assert_eq!(Length::Rem(1.5).resolve(500.0, font), 15.0);
    assert_eq!(Length::Em(-0.5).resolve(0.0, font), -7.0);
}

#[test]
fn font_rel_defaults_to_the_engine_font_size() {
    let d = FontRel::default();
    assert_eq!((d.em, d.rem), (DEFAULT_FONT_SIZE_PT, DEFAULT_FONT_SIZE_PT));
}

#[test]
fn invalid_strings_are_rejected() {
    for bad in [
        "\"50px\"",
        "\"abc\"",
        "\"%\"",
        "\"\"",
        "\"pt\"",
        "\"mm\"",
        "\"80 m\"",
        "\"1e309%\"",
        "\"1e309mm\"",
        "\"em\"",
        "\"rem\"",
        "\"1.2EM\"",
        "\"1e309em\"",
        "\"1e309rem\"",
    ] {
        assert!(parse(bad).is_err(), "expected rejection: {bad}");
    }
}

#[test]
fn finite_value_overflowing_in_pt_is_rejected() {
    // 1e308 is a finite f64, but ×72 (in→pt) overflows to infinity: the
    // converted form must be guarded too.
    assert!(parse("\"1e308in\"").is_err());
    assert!(parse("\"1e308cm\"").is_err());
}

#[test]
fn error_messages_truncate_hostile_strings() {
    let long = "x".repeat(10_000);
    let err = parse(&format!("\"{long}\""))
        .expect_err("rejected")
        .to_string();
    assert!(err.len() < 200, "unbounded echo: {err}");
    assert!(err.contains('…'));

    let err = parse(&format!("\"{long}%\""))
        .expect_err("rejected")
        .to_string();
    assert!(err.len() < 200, "unbounded echo: {err}");

    let err = parse(&format!("\"{long}mm\""))
        .expect_err("rejected")
        .to_string();
    assert!(err.len() < 200, "unbounded echo: {err}");
}

#[test]
fn non_finite_bare_number_is_rejected() {
    // `parse_template` already blocks `.inf` via yaml_guard; this
    // guards direct deserialization too.
    assert!(parse(".inf").is_err());
}

#[test]
fn resolve_pt_ignores_basis_and_percent_scales() {
    let font = FontRel::default();
    assert_eq!(Length::Pt(30.0).resolve(500.0, font), 30.0);
    assert_eq!(Length::Percent(50.0).resolve(500.0, font), 250.0);
    assert_eq!(Length::Percent(-10.0).resolve(200.0, font), -20.0);
}

#[test]
fn serializes_back_to_wire_form() {
    assert_eq!(
        serde_yaml::to_string(&Length::Pt(25.0))
            .expect("yaml")
            .trim(),
        "25.0"
    );
    assert_eq!(
        serde_yaml::to_string(&Length::Percent(50.0))
            .expect("yaml")
            .trim(),
        "50%"
    );
}

#[test]
fn physical_units_round_trip_their_authored_form() {
    // North star: serialization preserves the authored form — `80mm`
    // stays `80mm`, never a normalized pt number.
    for (yaml, expected) in [
        ("\"80mm\"", "80mm"),
        ("\"1.5cm\"", "1.5cm"),
        ("\"1in\"", "1in"),
        ("\"1.2em\"", "1.2em"),
        ("\"1.5rem\"", "1.5rem"),
    ] {
        let parsed = parse(yaml).expect("parse");
        assert_eq!(
            serde_yaml::to_string(&parsed).expect("yaml").trim(),
            expected
        );
    }
}
