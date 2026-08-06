//! Unit tests for the [`OptBox`] wire keys: the D3 min/max bounds and
//! the D4 `flexGrow` weight — parse, the Length forms, authored-form
//! round-trip, defaults, and typo safety. Plus [`PointSpec`], the `line`
//! endpoint, whose axes are full `Length`s.

use super::{OptBox, PointSpec};
use crate::length::Length;

fn parse(yaml: &str) -> OptBox {
    serde_yaml::from_str(yaml).expect("box should parse")
}

fn point(yaml: &str) -> PointSpec {
    serde_yaml::from_str(yaml).expect("point should parse")
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
fn an_endpoint_takes_every_length_form() {
    let p = point("{ x: \"100%\", y: \"1.5em\" }");
    assert_eq!(p.x, Length::Percent(100.0));
    assert_eq!(p.y, Length::Em(1.5));
    let p = point("{ x: \"20mm\", y: \"2rem\" }");
    assert!(matches!(p.x, Length::Physical(v, _) if v == 20.0));
    assert_eq!(p.y, Length::Rem(2.0));
}

#[test]
fn a_bare_number_endpoint_stays_pt_and_round_trips_as_a_number() {
    // The wire-compatibility clause: every pre-existing template writes
    // bare numbers, and they must come back out as bare numbers — not as
    // `"0pt"` — or the Designer's serialize(parse(src)) == src breaks and
    // every committed template's bytes churn.
    let p = point("{ x: 0, y: 28.5 }");
    assert_eq!(p.x, Length::Pt(0.0));
    assert_eq!(p.y, Length::Pt(28.5));
    let yaml = serde_yaml::to_string(&p).expect("serialize");
    assert!(yaml.contains("x: 0"), "got: {yaml}");
    assert!(yaml.contains("y: 28.5"), "got: {yaml}");
    assert!(!yaml.contains("pt"), "unit injected: {yaml}");
    // The authored `%` form round-trips as the string it was written as.
    let yaml = serde_yaml::to_string(&point("{ x: \"50%\", y: 0 }")).expect("serialize");
    assert!(yaml.contains("x: 50%"), "got: {yaml}");
}

#[test]
fn a_malformed_endpoint_is_a_parse_error_not_a_silent_zero() {
    // `px` is deliberately not a template unit, and a garbage string must
    // not degrade to 0 — a line silently collapsing to a point is exactly
    // the invisible authoring bug the wire is meant to surface.
    // The error echoes the OFFENDING VALUE and lists the accepted forms,
    // which is what makes it actionable. (It does not name the axis — the
    // `Length` parser is field-agnostic and reports the same way for
    // `w`/`minWidth`/every other length key.)
    for (yaml, bad) in [
        ("{ x: \"12px\", y: 0 }", "12px"),
        ("{ x: abc, y: 0 }", "abc"),
        ("{ y: \"3ex\", x: 0 }", "3ex"),
    ] {
        let e = serde_yaml::from_str::<PointSpec>(yaml)
            .expect_err("must reject")
            .to_string();
        assert!(e.contains("invalid length"), "got: {e}");
        assert!(e.contains(bad), "error must echo `{bad}`: {e}");
        assert!(e.contains("em"), "error must list the accepted units: {e}");
    }
    // An empty string is refused too, rather than defaulting to 0.
    let e = serde_yaml::from_str::<PointSpec>("{ x: \"\", y: 0 }").expect_err("must reject");
    assert!(e.to_string().contains("invalid length"), "got: {e}");
    // Hostile non-finite strings are refused at the Length boundary too.
    let e = serde_yaml::from_str::<PointSpec>("{ x: \"1e309%\", y: 0 }").expect_err("must reject");
    assert!(!e.to_string().is_empty(), "got: {e}");
    // And an unknown axis stays a parse error under deny_unknown_fields.
    let e = serde_yaml::from_str::<PointSpec>("{ x: 0, y: 0, z: 1 }").expect_err("must reject");
    assert!(e.to_string().contains("unknown field"), "got: {e}");
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
