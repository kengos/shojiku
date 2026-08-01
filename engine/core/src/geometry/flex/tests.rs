//! Unit tests for the flex box keys: parse, defaults, typo rejection,
//! and authored-form round-trip.

use crate::geometry::{AlignItems, BoxType, FlexDirection, JustifyContent, OptBox};

fn parse(yaml: &str) -> OptBox {
    serde_yaml::from_str(yaml).expect("box should parse")
}

fn parse_err(yaml: &str) -> String {
    serde_yaml::from_str::<OptBox>(yaml)
        .expect_err("box should be rejected")
        .to_string()
}

#[test]
fn flex_keys_parse_with_camel_case_keys_and_snake_case_values() {
    let b = parse(
        "{ type: flex, direction: row, gap: \"5%\", alignItems: center, \
         justifyContent: space_between }",
    );
    assert_eq!(b.type_, Some(BoxType::Flex));
    assert_eq!(b.direction, Some(FlexDirection::Row));
    assert!(b.gap.is_some());
    assert_eq!(b.align_items, Some(AlignItems::Center));
    assert_eq!(b.justify_content, Some(JustifyContent::SpaceBetween));
    assert!(b.has_layout_keys());
}

#[test]
fn align_items_baseline_parses_and_round_trips() {
    let b = parse("{ alignItems: baseline }");
    assert_eq!(b.align_items, Some(AlignItems::Baseline));
    let out = serde_yaml::to_string(&b).expect("serialize");
    assert!(out.contains("alignItems: baseline"), "got: {out}");
}

#[test]
fn unset_flex_keys_default_to_none() {
    let b = parse("{ x: 5 }");
    assert_eq!(b.type_, None);
    assert_eq!(b.direction, None);
    assert!(b.gap.is_none() && b.align_items.is_none() && b.justify_content.is_none());
    assert!(!b.has_layout_keys());
}

#[test]
fn each_flex_key_alone_counts_as_authored() {
    for yaml in [
        "{ type: flex }",
        "{ direction: column }",
        "{ gap: 4 }",
        "{ alignItems: end }",
        "{ justifyContent: space_evenly }",
    ] {
        assert!(parse(yaml).has_layout_keys(), "{yaml}");
    }
}

#[test]
fn unknown_variants_and_keys_are_rejected() {
    assert!(parse_err("{ type: table }").contains("unknown variant"));
    assert!(parse_err("{ direction: diagonal }").contains("unknown variant"));
    assert!(parse_err("{ alignItems: middle }").contains("unknown variant"));
    assert!(parse_err("{ justifyContent: space-between }").contains("unknown variant"));
    // deny_unknown_fields: a typo'd key must not silently mean "unset".
    assert!(parse_err("{ alignItmes: center }").contains("alignItmes"));
}

#[test]
fn flex_keys_round_trip_and_unset_keys_are_skipped() {
    let b = parse("{ direction: row, justifyContent: space_around }");
    let out = serde_yaml::to_string(&b).expect("serialize");
    assert!(out.contains("direction: row"), "{out}");
    assert!(out.contains("justifyContent: space_around"), "{out}");
    assert!(!out.contains("type"), "unset type serialized: {out}");
    assert!(
        !out.contains("alignItems"),
        "unset alignItems serialized: {out}"
    );
    assert!(!out.contains("gap"), "unset gap serialized: {out}");
}
