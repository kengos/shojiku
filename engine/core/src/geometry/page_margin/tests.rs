//! Unit tests for the `page.margin` wire forms, guards, and round-trip.

use super::*;
use crate::PhysicalUnit;

fn parse(yaml: &str) -> PageMargin {
    serde_yaml::from_str(yaml).expect("page margin should parse")
}

fn parse_err(yaml: &str) -> String {
    serde_yaml::from_str::<PageMargin>(yaml)
        .expect_err("page margin should be rejected")
        .to_string()
}

#[test]
fn bare_number_applies_to_all_sides() {
    assert_eq!(parse("18").edges(), [Length::Pt(18.0); 4]);
}

#[test]
fn map_sets_named_sides_and_defaults_the_rest_to_zero() {
    let e = parse("{ top: 10, left: \"5%\" }").edges();
    assert_eq!(e[0], Length::Pt(10.0));
    assert_eq!(e[1], Length::Pt(0.0));
    assert_eq!(e[2], Length::Pt(0.0));
    assert_eq!(e[3], Length::Percent(5.0));
}

#[test]
fn legacy_array_maps_to_css_order_and_accepts_units() {
    let e = parse("[25, \"5%\", \"10mm\", 40]").edges();
    assert_eq!(e[0], Length::Pt(25.0));
    assert_eq!(e[1], Length::Percent(5.0));
    assert_eq!(e[2], Length::Physical(10.0, PhysicalUnit::Mm));
    assert_eq!(e[3], Length::Pt(40.0));
}

#[test]
fn default_is_25pt_on_every_side() {
    assert_eq!(PageMargin::default().edges(), [Length::Pt(25.0); 4]);
}

#[test]
fn negative_sides_are_rejected_in_every_form() {
    for yaml in [
        "-1",
        "{ top: -1 }",
        "[0, 0, -1, 0]",
        "[0, \"-5%\", 0, 0]",
        // Array forms route through the legacy-array guard (`negative`),
        // not `EdgeSpec::any_negative` — cover em/rem on both paths.
        "{ top: \"-1em\" }",
        "{ left: \"-2rem\" }",
        "[0, \"-1em\", 0, 0]",
        "[0, 0, \"-2rem\", 0]",
    ] {
        assert!(parse_err(yaml).contains("must not be negative"), "{yaml}");
    }
}

#[test]
fn auto_is_rejected() {
    assert!(parse_err("{ left: auto }").contains("must not be `auto`"));
}

#[test]
fn wrong_array_length_is_rejected() {
    assert!(parse_err("[1, 2, 3]").contains("invalid length"));
    assert!(parse_err("[1, 2, 3, 4, 5]").contains("invalid length"));
}

#[test]
fn unknown_map_keys_are_rejected() {
    assert!(parse_err("{ letf: 10 }").contains("letf"));
}

#[test]
fn bare_string_is_rejected() {
    assert!(parse_err("\"25 40\"").contains("mapping"));
}

#[test]
fn hostile_string_error_is_truncated() {
    let err = parse_err(&format!("\"{}\"", "z".repeat(4096)));
    assert!(err.len() < 200, "error echoes unbounded input: {err}");
}

#[test]
fn unsupported_value_kind_is_rejected_with_the_expected_forms() {
    // A bool has no dedicated visit arm; serde's default error carries
    // the visitor's `expecting` text.
    let err = parse_err("true");
    assert!(err.contains("a number (all sides)"), "{err}");
}

fn template_yaml(margin: &str) -> String {
    format!("page: {{ margin: {margin} }}\nsections:\n  body: {{ type: absolute, items: [] }}")
}

// The nested field path (`parse_template` -> `PageSpec` map access)
// instantiates the visitor with a different deserializer than a bare
// `from_str::<PageMargin>`; exercise every arm through it too so the
// per-instantiation coverage stays honest (see the coverage notes in
// CLAUDE.md).
#[test]
fn every_form_parses_inside_a_template() {
    for (margin, top) in [
        ("25", 25.0),
        ("18.5", 18.5),
        ("{ top: 10, left: \"5%\" }", 10.0),
        ("[30, 25, 25, 25]", 30.0),
    ] {
        let tpl = crate::parse_template(&template_yaml(margin))
            .unwrap_or_else(|e| panic!("{margin}: {e}"));
        assert_eq!(tpl.page.margin.edges()[0], Length::Pt(top), "{margin}");
    }
}

#[test]
fn every_rejection_surfaces_through_a_template() {
    for margin in ["-1", "{ left: auto }", "\"25 40\"", "true", "[1, 2, 3]"] {
        assert!(
            crate::parse_template(&template_yaml(margin)).is_err(),
            "{margin} should be rejected"
        );
    }
}

#[test]
fn overflowing_numbers_are_rejected() {
    // serde_yaml hands an overflowing bare number over as a *string*
    // (see the edges tests), so the string rejection catches it; inside
    // the array the `Length` parser rejects it as unitless.
    let err = parse_err("1e309");
    assert!(err.contains("mapping"), "{err}");
    let err = parse_err("[1e309, 0, 0, 0]");
    assert!(!err.is_empty(), "{err}");
}

#[test]
fn authored_form_round_trips() {
    for (yaml, expected) in [
        ("25", "25.0"),
        ("{ top: 10 }", "top: 10.0"),
        ("[25, 25, 25, 25]", "- 25.0\n- 25.0\n- 25.0\n- 25.0"),
        ("[25, \"10mm\", 0, 0]", "- 25.0\n- 10mm\n- 0.0\n- 0.0"),
    ] {
        let out = serde_yaml::to_string(&parse(yaml)).expect("serialize");
        assert_eq!(out.trim(), expected, "round-trip of {yaml}");
    }
}
