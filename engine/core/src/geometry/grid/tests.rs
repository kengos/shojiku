//! Unit tests for the `TrackSpec` wire form: count vs track list,
//! rejections, and authored-form round-trip.

use crate::geometry::{GridTrack, OptBox, TrackSpec};
use crate::length::Length;

fn parse(yaml: &str) -> OptBox {
    serde_yaml::from_str(yaml).expect("box should parse")
}

fn parse_err(yaml: &str) -> String {
    serde_yaml::from_str::<OptBox>(yaml)
        .expect_err("box should be rejected")
        .to_string()
}

#[test]
fn count_and_track_list_parse() {
    let b = parse("{ type: grid, columns: 3, rows: [\"20%\", 40, \"8mm\"] }");
    assert_eq!(b.columns, Some(TrackSpec::Count(3)));
    let Some(TrackSpec::Tracks(rows)) = &b.rows else { panic!("rows should be tracks") };
    assert_eq!(rows[0], GridTrack::Fixed(Length::Percent(20.0)));
    assert_eq!(rows[1], GridTrack::Fixed(Length::Pt(40.0)));
    assert!(b.has_grid_keys() && b.has_layout_keys());
}

#[test]
fn grid_gaps_parse_and_unset_grid_keys_default_to_none() {
    let b = parse("{ type: grid, columnGap: 10, rowGap: \"5%\" }");
    assert!(b.column_gap.is_some() && b.row_gap.is_some());
    let plain = parse("{ x: 5 }");
    assert!(!plain.has_grid_keys());
    assert!(plain.columns.is_none() && plain.rows.is_none());
}

#[test]
fn string_fractional_and_negative_counts_are_rejected() {
    assert!(parse_err("{ columns: \"30% 70%\" }").contains("track count or a sequence"));
    assert!(parse_err("{ columns: 2.5 }").contains("whole number"));
    assert!(parse_err("{ columns: -2 }").contains("must not be negative"));
    // Garbage inside a track list surfaces the Length error.
    assert!(parse_err("{ columns: [bogus] }").contains("invalid length"));
    // A mapping trips the visitor's expected-forms message.
    assert!(parse_err("{ columns: { a: 1 } }").contains("track count (number)"));
}

#[test]
fn track_specs_round_trip_in_authored_form() {
    let b = parse("{ type: grid, columns: 2, rows: [\"30%\", \"8mm\"] }");
    let out = serde_yaml::to_string(&b).expect("serialize");
    assert!(out.contains("columns: 2"), "{out}");
    assert!(out.contains("- 30%") && out.contains("- 8mm"), "{out}");
    // Unset grid keys are skipped entirely.
    let plain = serde_yaml::to_string(&parse("{ x: 5 }")).expect("serialize");
    assert!(
        !plain.contains("columns") && !plain.contains("rowGap"),
        "{plain}"
    );
}

#[test]
fn huge_count_parses_and_is_left_for_layout_to_clamp() {
    // Parse accepts any count; the layout pass clamps to MAX_GRID_TRACKS
    // with a diagnostic (no allocation happens at parse).
    let b = parse("{ columns: 1000000000 }");
    assert_eq!(b.columns, Some(TrackSpec::Count(1_000_000_000)));
}

#[test]
fn an_auto_track_parses_trims_and_round_trips() {
    // T1. `auto` is a track keyword alongside a length and an `fr`
    // weight, and it survives the authored-form round-trip as the same
    // word — a re-serialized template must stay re-parseable.
    let b = parse("{ type: grid, columns: [\"auto\", \"1fr\", 40] }");
    let Some(TrackSpec::Tracks(cols)) = &b.columns else { panic!("columns should be tracks") };
    assert_eq!(cols[0], GridTrack::Auto);
    assert_eq!(cols[1], GridTrack::Fr(1.0));
    assert_eq!(cols[2], GridTrack::Fixed(Length::Pt(40.0)));
    // Surrounding space is trimmed, as it is for every string track.
    let padded = parse("{ type: grid, columns: [\"  auto  \"] }");
    let Some(TrackSpec::Tracks(cols)) = &padded.columns else { panic!("columns should be tracks") };
    assert_eq!(cols[0], GridTrack::Auto);

    let yaml = serde_yaml::to_string(&b).expect("serialize");
    assert!(yaml.contains("auto"), "got: {yaml}");
    let again: OptBox = serde_yaml::from_str(&yaml).expect("re-parse");
    assert_eq!(again.columns, b.columns);
}

#[test]
fn a_mis_cased_or_extended_auto_is_a_parse_error() {
    // T2. `auto` is matched EXACTLY, the same spelling rule the `auto`
    // margin sides follow. A near-miss must surface as an authoring
    // error, never fall through to a length parse that quietly yields
    // something else.
    for bad in ["AUTO", "Auto", "autox", "auto auto"] {
        let e = parse_err(&format!("{{ type: grid, columns: [\"{bad}\"] }}"));
        assert!(
            !e.is_empty(),
            "`{bad}` must be rejected, not parsed as a track"
        );
    }
}
