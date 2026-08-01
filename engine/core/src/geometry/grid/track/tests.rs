//! Unit tests for [`GridTrack`] parsing/serialization: fixed lengths vs
//! `fr` weights, the `fr`-is-not-a-Length boundary, hostile rejections,
//! and authored-form round-trip.

use crate::geometry::{GridTrack, OptBox, TrackSpec};
use crate::length::Length;

fn tracks(yaml: &str) -> Vec<GridTrack> {
    let b: OptBox = serde_yaml::from_str(yaml).expect("box should parse");
    let Some(TrackSpec::Tracks(list)) = b.columns else {
        panic!("columns should be a track list");
    };
    list
}

fn parse_err(yaml: &str) -> String {
    serde_yaml::from_str::<OptBox>(yaml)
        .expect_err("box should be rejected")
        .to_string()
}

#[test]
fn fr_weights_and_fixed_tracks_parse_together() {
    let list = tracks("{ columns: [\"1fr\", \"2.5fr\", \"30%\", 90, \"2em\"] }");
    assert_eq!(list[0], GridTrack::Fr(1.0));
    assert_eq!(list[1], GridTrack::Fr(2.5));
    assert_eq!(list[2], GridTrack::Fixed(Length::Percent(30.0)));
    assert_eq!(list[3], GridTrack::Fixed(Length::Pt(90.0)));
    assert_eq!(list[4], GridTrack::Fixed(Length::Em(2.0)));
}

#[test]
fn zero_fr_weight_parses() {
    assert_eq!(
        tracks("{ columns: [\"0fr\", \"1fr\"] }")[0],
        GridTrack::Fr(0.0)
    );
}

#[test]
fn fr_tracks_round_trip_in_authored_form() {
    let b: OptBox =
        serde_yaml::from_str("{ type: grid, columns: [\"1fr\", \"2fr\", 90] }").expect("parse");
    let out = serde_yaml::to_string(&b).expect("serialize");
    assert!(out.contains("- 1fr") && out.contains("- 2fr"), "{out}");
    assert!(out.contains("- 90"), "{out}");
}

#[test]
fn negative_fr_weight_is_rejected() {
    assert!(parse_err("{ columns: [\"-1fr\"] }").contains("must not be negative"));
}

#[test]
fn non_finite_fr_weight_is_rejected() {
    // String forms bypass the YAML finiteness guard and are re-checked.
    assert!(parse_err("{ columns: [\"1e309fr\"] }").contains("not finite"));
    assert!(parse_err("{ columns: [\"inffr\"] }").contains("not finite"));
    assert!(parse_err("{ columns: [\"NaNfr\"] }").contains("not finite"));
}

#[test]
fn garbage_fr_weight_surfaces_a_parse_error() {
    assert!(parse_err("{ columns: [\"xfr\"] }").contains("invalid `fr` weight"));
}

#[test]
fn fr_is_not_a_length_outside_grid_tracks() {
    // `fr` is a grid-track-only unit: a plain box length rejects it with
    // the ordinary Length error, so `fr` cannot leak elsewhere.
    assert!(parse_err("{ w: \"1fr\" }").contains("invalid length"));
}
