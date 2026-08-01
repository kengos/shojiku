//! Unit tests for the per-side `EdgeSpec` parser and its round-trip.

use super::*;
use crate::geometry::OptBox;
use crate::PhysicalUnit;

fn parse(yaml: &str) -> EdgeSpec {
    serde_yaml::from_str(yaml).expect("edge spec should parse")
}

fn parse_err(yaml: &str) -> String {
    serde_yaml::from_str::<EdgeSpec>(yaml)
        .expect_err("edge spec should be rejected")
        .to_string()
}

#[test]
fn bare_number_applies_to_all_sides() {
    assert_eq!(parse("12.5").edges(), [Length::Pt(12.5); 4]);
}

#[test]
fn map_sets_named_sides_and_defaults_the_rest_to_zero() {
    let e = parse("{ top: 10, left: 20 }").edges();
    assert_eq!(
        e,
        [
            Length::Pt(10.0),
            Length::Pt(0.0),
            Length::Pt(0.0),
            Length::Pt(20.0)
        ]
    );
}

#[test]
fn sides_accept_every_length_unit() {
    let e = parse("{ top: \"10pt\", right: \"5%\", bottom: \"2mm\", left: \"1in\" }").edges();
    assert_eq!(e[0], Length::Pt(10.0));
    assert_eq!(e[1], Length::Percent(5.0));
    assert_eq!(e[2], Length::Physical(2.0, PhysicalUnit::Mm));
    assert_eq!(e[3], Length::Physical(1.0, PhysicalUnit::In));
}

#[test]
fn unknown_side_keys_are_rejected() {
    // A typo silently meaning 0 would be an invisible authoring bug.
    assert!(parse_err("{ letf: 5 }").contains("letf"));
}

#[test]
fn garbage_and_nonfinite_sides_are_rejected() {
    // A typo'd `auto` errors, and the message advertises the keyword.
    let err = parse_err("{ left: aut }");
    assert!(
        err.contains("invalid length") && err.contains("auto"),
        "{err}"
    );
    assert!(parse_err("{ top: bogus }").contains("invalid length"));
    assert!(parse_err("{ top: \"1e309pt\" }").contains("not finite"));
    // serde_yaml never yields a non-finite f64 — an overflowing bare
    // number falls back to the string path and its rejection.
    assert!(parse_err("1e309").contains("got string"));
}

#[test]
fn auto_sides_parse_flag_and_resolve_to_zero() {
    let spec = parse("{ left: auto, top: 4 }");
    assert_eq!(spec.auto_sides(), [false, false, false, true]);
    // `edges()` sees auto as 0 — the free-space share is layout's job.
    assert_eq!(spec.edges()[3], Length::Pt(0.0));
    assert_eq!(spec.edges()[0], Length::Pt(4.0));
    assert_eq!(parse("6").auto_sides(), [false; 4]);
}

#[test]
fn auto_round_trips_in_authored_form() {
    let out = serde_yaml::to_string(&parse("{ left: auto, right: auto }")).expect("serialize");
    assert_eq!(out.trim(), "right: auto\nleft: auto");
}

#[test]
fn bare_auto_string_is_rejected_with_a_pointer_to_the_map_form() {
    let err = parse_err("auto");
    assert!(err.contains("{ left: auto }"), "{err}");
}

#[test]
fn all_sides_guards_nonfinite_numbers() {
    // Unreachable through serde_yaml (see above) but `all_sides` is the
    // finite gate for any deserializer that does hand it an f64.
    let err = all_sides(f64::INFINITY).expect_err("inf rejected");
    assert!(err.contains("not finite"));
}

#[test]
fn string_shorthand_is_rejected_with_a_pointer_to_the_map_form() {
    assert!(parse_err("\"10 20\"").contains("top/right/bottom/left"));
}

#[test]
fn other_yaml_types_are_rejected_with_the_expected_forms() {
    assert!(parse_err("[1, 2]").contains("a number (all sides)"));
}

#[test]
fn hostile_side_value_error_is_truncated() {
    let err = parse_err(&format!("{{ top: \"{}\" }}", "z".repeat(4096)));
    assert!(err.len() < 200, "error echoes unbounded input: {err}");
    let err = parse_err(&format!("\"{}\"", "z".repeat(4096)));
    assert!(err.len() < 200, "error echoes unbounded input: {err}");
}

#[test]
fn round_trip_serializes_only_the_authored_keys() {
    let spec = parse("{ top: 10, left: \"5%\" }");
    let out = serde_yaml::to_string(&spec).expect("serialize");
    assert_eq!(out.trim(), "top: 10.0\nleft: 5%");
}

#[test]
fn round_trip_keeps_physical_units_in_authored_form() {
    let out = serde_yaml::to_string(&parse("{ bottom: \"8mm\" }")).expect("serialize");
    assert_eq!(out.trim(), "bottom: 8mm");
}

#[test]
fn round_trip_keeps_bare_number_a_number() {
    let out = serde_yaml::to_string(&parse("6")).expect("serialize");
    assert_eq!(out.trim(), "6.0");
}

#[test]
fn hand_built_number_form_degrades_to_the_map() {
    let spec = EdgeSpec {
        sides: [Some(EdgeValue::Len(Length::Percent(5.0))); 4],
        form: EdgeForm::Number,
    };
    let out = serde_yaml::to_string(&spec).expect("serialize");
    assert!(out.contains("top: 5%"), "degraded map form: {out}");
}

#[test]
fn optbox_parses_margin_and_padding_and_skips_unset() {
    let b: OptBox =
        serde_yaml::from_str("{ x: 5, margin: { top: 1, right: 2 }, padding: 3 }").expect("box");
    let margin = b.margin.expect("margin");
    assert_eq!(margin.edges()[1], Length::Pt(2.0));
    let padding = b.padding.expect("padding");
    assert_eq!(padding.edges()[0], Length::Pt(3.0));

    let bare: OptBox = serde_yaml::from_str("{ x: 5 }").expect("box");
    let out = serde_yaml::to_string(&bare).expect("serialize");
    assert!(!out.contains("margin"), "unset margin serialized: {out}");
    assert!(!out.contains("padding"), "unset padding serialized: {out}");
}

#[test]
fn explicit_null_padding_stays_unset() {
    let b: OptBox = serde_yaml::from_str("{ padding: ~ }").expect("null padding");
    assert!(b.padding.is_none());
}

#[test]
fn negative_margin_is_allowed_negative_padding_rejected() {
    let b: OptBox = serde_yaml::from_str("{ margin: { top: -5 } }").expect("negative margin");
    assert_eq!(b.margin.expect("margin").edges()[0], Length::Pt(-5.0));

    for yaml in [
        "{ padding: -1 }",
        "{ padding: { top: \"-5%\" } }",
        "{ padding: { right: \"-2mm\" } }",
        "{ padding: { top: \"-1em\" } }",
        "{ padding: { left: \"-1rem\" } }",
    ] {
        let err = serde_yaml::from_str::<OptBox>(yaml)
            .expect_err("negative padding should be rejected")
            .to_string();
        assert!(err.contains("must not be negative"), "{yaml}: {err}");
    }
}

#[test]
fn auto_margin_parses_on_boxes_but_auto_padding_is_rejected() {
    let b: OptBox = serde_yaml::from_str("{ margin: { left: auto } }").expect("auto margin");
    assert_eq!(
        b.margin.expect("margin").auto_sides(),
        [false, false, false, true]
    );

    let err = serde_yaml::from_str::<OptBox>("{ padding: { left: auto } }")
        .expect_err("auto padding should be rejected")
        .to_string();
    assert!(err.contains("must not be `auto`"), "{err}");
}

#[test]
fn edge_specs_compare_and_debug_format() {
    // Exercises the derived PartialEq/Debug (kept for test ergonomics).
    assert_eq!(parse("{ left: auto }"), parse("{ left: auto }"));
    assert_ne!(parse("6"), parse("7"));
    let dbg = format!("{:?}", parse("6"));
    assert!(dbg.contains("Number"), "{dbg}");
}

#[test]
fn non_scalar_side_values_are_rejected_with_the_expected_forms() {
    // A sequence side value trips the visitor's `expecting` message.
    let err = parse_err("{ top: [1, 2] }");
    assert!(err.contains("or `auto`"), "{err}");
}
