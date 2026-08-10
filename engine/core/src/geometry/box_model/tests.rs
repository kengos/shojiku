//! Unit tests for the [`OptBox`] wire keys: the min/max bounds and
//! the `flexGrow` weight — parse, the Length forms, authored-form
//! round-trip, defaults, and typo safety. The `line` endpoint
//! ([`crate::geometry::PointSpec`]) has its own sibling tests.

use super::OptBox;
use crate::length::Length;

fn parse(yaml: &str) -> OptBox {
    serde_yaml::from_str(yaml).expect("box should parse")
}

#[test]
fn min_max_keys_parse_every_length_form() {
    let b = parse("{ minWidth: 100, maxWidth: \"50%\", minHeight: \"20mm\", maxHeight: 300 }");
    assert_eq!(b.min_width, Some(Length::Pt(100.0)));
    assert_eq!(b.max_width, Some(Length::Percent(50.0)));
    assert!(matches!(b.min_height, Some(Length::Physical(v, _)) if v == 20.0));
    assert_eq!(b.max_height, Some(Length::Pt(300.0)));
}

#[test]
fn min_max_keys_default_to_none() {
    let b = parse("{ w: 10 }");
    assert!(b.min_width.is_none() && b.max_width.is_none());
    assert!(b.min_height.is_none() && b.max_height.is_none());
}

#[test]
fn min_max_round_trip_in_authored_form_and_skip_when_unset() {
    let b = parse("{ w: 10, maxWidth: 200 }");
    let yaml = serde_yaml::to_string(&b).expect("serialize");
    assert!(yaml.contains("maxWidth: 200"), "got: {yaml}");
    // Unset bounds are skipped, not injected as null.
    assert!(!yaml.contains("minWidth"), "injected minWidth: {yaml}");
    assert!(!yaml.contains("minHeight"), "injected minHeight: {yaml}");
    assert!(!yaml.contains("maxHeight"), "injected maxHeight: {yaml}");
}

#[test]
fn min_max_typos_are_rejected_under_deny_unknown_fields() {
    // A CSS spelling we do not use, and a near-miss camelCase, must be
    // parse errors — never silently unset.
    for yaml in ["{ min-width: 10 }", "{ minwidth: 10 }", "{ maxW: 10 }"] {
        let e = serde_yaml::from_str::<OptBox>(yaml).expect_err("must reject");
        assert!(e.to_string().contains("unknown field"), "got: {e}");
    }
}

#[test]
fn min_max_percent_string_is_finite_checked_by_length_parser() {
    // Non-finite percent strings are rejected at the Length boundary,
    // same as w/h.
    let e = serde_yaml::from_str::<OptBox>("{ maxWidth: \"1e309%\" }").expect_err("must reject");
    assert!(!e.to_string().is_empty());
}

#[test]
fn flex_grow_effective_default_is_zero_and_round_trips() {
    // Unset → 0, CSS's initial `flex-grow`. It used to be 1, from when
    // an unsized row child split the leftover evenly whether the author
    // asked or not; now the child sizes to its content and growing is
    // opt-in. Authored values are kept as written.
    assert_eq!(parse("{ w: 10 }").flex_grow(), 0.0);
    let b = parse("{ flexGrow: 2 }");
    assert_eq!(b.flex_grow, Some(2.0));
    assert_eq!(b.flex_grow(), 2.0);
    // Round-trips in authored form; unset is skipped, not injected.
    let yaml = serde_yaml::to_string(&b).expect("serialize");
    assert!(yaml.contains("flexGrow: 2"), "got: {yaml}");
    assert!(
        !serde_yaml::to_string(&parse("{ w: 10 }"))
            .unwrap()
            .contains("flexGrow"),
        "injected flexGrow"
    );
    // A mis-cased near-miss is a parse error, never a silently-unset key
    // (the North star: authoring typos surface, they don't default).
    for typo in ["{ flexgrow: 1 }", "{ flex_grow: 1 }", "{ grow: 1 }"] {
        let e = serde_yaml::from_str::<OptBox>(typo).expect_err("must reject");
        assert!(e.to_string().contains("unknown field"), "got: {e}");
    }
}

#[test]
fn flex_basis_parses_its_variants_and_stays_unset_when_unwritten() {
    // `flexBasis` picks where a flexible child STARTS: `content`
    // (the default) from its own max-content size, `0` from nothing so
    // `flexGrow` divides the whole row — CSS's `flex: 1`.
    use crate::geometry::FlexBasis;
    assert_eq!(parse("{ w: 10 }").flex_basis(), FlexBasis::Content);
    assert_eq!(parse("{ w: 10 }").flex_basis, None);
    assert_eq!(
        parse("{ flexBasis: content }").flex_basis,
        Some(FlexBasis::Content)
    );
    let zero = parse("{ flexBasis: 0 }");
    assert_eq!(zero.flex_basis, Some(FlexBasis::Zero));
    assert_eq!(zero.flex_basis(), FlexBasis::Zero);

    // Round-trips in authored form; an unset key is skipped, never
    // injected. Asserted on the BOX alone — serializing a whole template
    // would let the older structs around it supply defaults and hide an
    // injection here.
    let yaml = serde_yaml::to_string(&zero).expect("serialize");
    assert!(yaml.contains("flexBasis"), "got: {yaml}");
    // Both variants round-trip, so a re-serialized template stays
    // re-parseable whichever one the author wrote.
    let content = serde_yaml::to_string(&parse("{ flexBasis: content }")).expect("serialize");
    assert!(content.contains("content"), "got: {content}");
    let again: OptBox = serde_yaml::from_str(&content).expect("re-parse");
    assert_eq!(again.flex_basis, Some(FlexBasis::Content));
    assert!(
        !serde_yaml::to_string(&parse("{ w: 10 }"))
            .unwrap()
            .contains("flexBasis"),
        "injected flexBasis"
    );
}

#[test]
fn an_unknown_flex_basis_is_a_parse_error() {
    // The `flexBasis` variant set is closed: an authoring typo surfaces
    // instead of silently defaulting to `content` and laying out the
    // other way.
    for bad in [
        "{ flexBasis: auto }",
        "{ flexBasis: 1 }",
        "{ flexBasis: \"\" }",
    ] {
        serde_yaml::from_str::<OptBox>(bad).expect_err("must reject");
    }
}
