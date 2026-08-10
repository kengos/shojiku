//! Unit tests for [`PointSpec`], the `line` endpoint: the coordinate arm
//! (parse, every `Length` form, authored-form round-trip, typo safety) and
//! the anchored arm (defaults, mutual exclusion, the edge vocabulary).
//!
//! The coordinate cases predate anchoring and are re-pinned here against
//! the hand-written `Deserialize` that replaced the derive: they are the
//! wire-compatibility guarantee, and the whole reason the untagged enum
//! was refused.

use super::{AnchorEdge, AnchorOffset, PointSpec};
use crate::length::Length;

fn point(yaml: &str) -> PointSpec {
    serde_yaml::from_str(yaml).expect("point should parse")
}

fn xy(yaml: &str) -> (Length, Length) {
    point(yaml).xy().expect("should be a coordinate endpoint")
}

fn err(yaml: &str) -> String {
    serde_yaml::from_str::<PointSpec>(yaml)
        .expect_err("must reject")
        .to_string()
}

#[test]
fn an_endpoint_takes_every_length_form() {
    let (x, y) = xy("{ x: \"100%\", y: \"1.5em\" }");
    assert_eq!(x, Length::Percent(100.0));
    assert_eq!(y, Length::Em(1.5));
    let (x, y) = xy("{ x: \"20mm\", y: \"2rem\" }");
    assert!(matches!(x, Length::Physical(v, _) if v == 20.0));
    assert_eq!(y, Length::Rem(2.0));
}

#[test]
fn a_bare_number_endpoint_stays_pt_and_round_trips_as_a_number() {
    // The wire-compatibility clause: every pre-existing template writes
    // bare numbers, and they must come back out as bare numbers — not as
    // `"0pt"` — or the Designer's serialize(parse(src)) == src breaks and
    // every committed template's bytes churn.
    let (x, y) = xy("{ x: 0, y: 28.5 }");
    assert_eq!(x, Length::Pt(0.0));
    assert_eq!(y, Length::Pt(28.5));
    let yaml = serde_yaml::to_string(&point("{ x: 0, y: 28.5 }")).expect("serialize");
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
    for (yaml, bad) in [
        ("{ x: \"12px\", y: 0 }", "12px"),
        ("{ x: abc, y: 0 }", "abc"),
        ("{ y: \"3ex\", x: 0 }", "3ex"),
    ] {
        let e = err(yaml);
        assert!(e.contains("invalid length"), "got: {e}");
        assert!(e.contains(bad), "error must echo `{bad}`: {e}");
        assert!(e.contains("em"), "error must list the accepted units: {e}");
    }
    // An empty string is refused too, rather than defaulting to 0.
    assert!(err("{ x: \"\", y: 0 }").contains("invalid length"));
    // Hostile non-finite strings are refused at the Length boundary too.
    assert!(!err("{ x: \"1e309%\", y: 0 }").is_empty());
}

#[test]
fn an_unknown_key_is_refused_by_name() {
    // The pinned guarantee the untagged enum would have cost: serde's
    // untagged path reports "data did not match any variant" and never
    // names `z`. Pinned on both arms.
    assert!(err("{ x: 0, y: 0, z: 1 }").contains("unknown field"));
    assert!(err("{ x: 0, y: 0, z: 1 }").contains('z'));
    let e = err("{ item: total, z: 1 }");
    assert!(e.contains("unknown field"), "got: {e}");
    assert!(
        e.contains('z'),
        "the anchored arm must name the key too: {e}"
    );
}

#[test]
fn a_half_written_coordinate_names_the_missing_axis() {
    assert!(err("{ x: 0 }").contains('y'), "must name `y`");
    assert!(err("{ y: 0 }").contains('x'), "must name `x`");
}

#[test]
fn an_anchor_parses_with_center_and_no_offset_by_default() {
    let p = point("{ item: qr_zone }");
    let a = p.anchor().expect("should be an anchored endpoint");
    assert_eq!(a.item, "qr_zone");
    assert_eq!(a.edge, None, "the edge stays unauthored");
    assert_eq!(a.edge(), AnchorEdge::Center, "and reads as `center`");
    assert_eq!(a.offset, None);
    assert_eq!(a.offset(), AnchorOffset { x: 0.0, y: 0.0 });
    assert_eq!(p.xy(), None, "an anchor carries no coordinates");
}

#[test]
fn an_anchor_parses_with_every_key_together() {
    let p = point("{ item: qr_zone, edge: top, offset: { x: 4, y: -2 } }");
    let a = p.anchor().expect("anchored");
    assert_eq!(a.item, "qr_zone");
    assert_eq!(a.edge(), AnchorEdge::Top);
    assert_eq!(a.offset(), AnchorOffset { x: 4.0, y: -2.0 });
    // A one-axis offset leaves the other at zero rather than failing.
    let p = point("{ item: qr_zone, offset: { y: -4 } }");
    assert_eq!(
        p.anchor().expect("anchored").offset(),
        AnchorOffset { x: 0.0, y: -4.0 }
    );
}

#[test]
fn every_edge_keyword_parses_and_a_typo_does_not() {
    for (word, edge) in [
        ("top", AnchorEdge::Top),
        ("right", AnchorEdge::Right),
        ("bottom", AnchorEdge::Bottom),
        ("left", AnchorEdge::Left),
        ("center", AnchorEdge::Center),
    ] {
        let p = point(&format!("{{ item: a, edge: {word} }}"));
        assert_eq!(p.anchor().expect("anchored").edge(), edge);
    }
    // CSS spells the physical sides; `centre` and `middle` are not among
    // them, and a silently-ignored edge would place the leader wrong.
    assert!(!err("{ item: a, edge: centre }").is_empty());
    assert!(!err("{ item: a, edge: middle }").is_empty());
}

#[test]
fn the_two_arms_are_mutually_exclusive_and_neither_may_be_empty() {
    let e = err("{ x: 0, item: a }");
    assert!(e.contains("either"), "got: {e}");
    assert!(e.contains("item"), "got: {e}");
    // `edge`/`offset` are anchor keys: pairing them with coordinates is
    // the same authoring mistake, caught the same way.
    assert!(err("{ x: 0, y: 0, edge: top }").contains("either"));
    assert!(err("{ x: 0, y: 0, offset: { x: 1 } }").contains("either"));
    // An anchor shape with no target names the key it needs.
    assert!(err("{ edge: top }").contains("item"));
    // And an empty endpoint says what an endpoint is, rather than
    // reporting a missing `x` and leaving the anchor form undiscovered.
    let e = err("{}");
    assert!(e.contains("either `x` and `y` or `item`"), "got: {e}");
}

#[test]
fn each_arm_serializes_only_its_own_keys() {
    let yaml = serde_yaml::to_string(&point("{ item: a, edge: top }")).expect("serialize");
    assert!(yaml.contains("item: a"), "got: {yaml}");
    assert!(yaml.contains("edge: top"), "got: {yaml}");
    assert!(
        !yaml.contains('x'),
        "an anchor must not emit coordinates: {yaml}"
    );
    assert!(
        !yaml.contains("offset"),
        "unauthored offset injected: {yaml}"
    );
    // An unauthored edge stays unwritten, so `serialize(parse(src))` is
    // byte-identical for the shortest authored form.
    let yaml = serde_yaml::to_string(&point("{ item: a }")).expect("serialize");
    assert_eq!(yaml.trim(), "item: a");
    // And the coordinate arm never gains anchor keys.
    let yaml = serde_yaml::to_string(&point("{ x: 1, y: 2 }")).expect("serialize");
    assert!(!yaml.contains("item"), "got: {yaml}");
    assert!(!yaml.contains("edge"), "got: {yaml}");
}

#[test]
fn an_offset_serializes_only_the_axis_that_was_authored() {
    // A zero axis is skipped, so `offset: { y: -4 }` round-trips as written
    // rather than gaining an `x: 0` the author never typed.
    let yaml = serde_yaml::to_string(&point("{ item: a, offset: { y: -4 } }")).expect("serialize");
    assert!(yaml.contains("y: -4"), "got: {yaml}");
    assert!(!yaml.contains("x:"), "injected a zero x: {yaml}");
    // Both axes authored come back as both.
    let yaml =
        serde_yaml::to_string(&point("{ item: a, offset: { x: 4, y: -2 } }")).expect("serialize");
    assert!(
        yaml.contains("x: 4") && yaml.contains("y: -2"),
        "got: {yaml}"
    );
}
