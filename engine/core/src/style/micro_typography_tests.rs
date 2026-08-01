//! Parse / round-trip / rejection coverage for the JP micro-typography
//! keys `textSpacingTrim` and `hangingPunctuation`, plus their span-inert
//! listing in [`Style::ignored_span_keys`].

use super::*;

#[test]
fn text_spacing_trim_variants_round_trip() {
    for (variant, spelling) in [
        (TextSpacingTrim::SpaceAll, "space_all"),
        (TextSpacingTrim::Normal, "normal"),
        (TextSpacingTrim::TrimStart, "trim_start"),
    ] {
        let s = Style {
            text_spacing_trim: Some(variant),
            ..Style::default()
        };
        let yaml = serde_yaml::to_string(&s).expect("yaml");
        assert!(
            yaml.contains(&format!("textSpacingTrim: {spelling}")),
            "got: {yaml}"
        );
        let back: Style = serde_yaml::from_str(&yaml).expect("parse");
        assert_eq!(back.text_spacing_trim, Some(variant));
    }
}

#[test]
fn hanging_punctuation_variants_round_trip() {
    for (variant, spelling) in [
        (HangingPunctuation::None, "none"),
        (HangingPunctuation::AllowEnd, "allow_end"),
        (HangingPunctuation::ForceEnd, "force_end"),
    ] {
        let s = Style {
            hanging_punctuation: Some(variant),
            ..Style::default()
        };
        let yaml = serde_yaml::to_string(&s).expect("yaml");
        assert!(
            yaml.contains(&format!("hangingPunctuation: {spelling}")),
            "got: {yaml}"
        );
        let back: Style = serde_yaml::from_str(&yaml).expect("parse");
        assert_eq!(back.hanging_punctuation, Some(variant));
    }
}

#[test]
fn default_variants_are_space_all_and_none() {
    assert_eq!(TextSpacingTrim::default(), TextSpacingTrim::SpaceAll);
    assert_eq!(HangingPunctuation::default(), HangingPunctuation::None);
}

#[test]
fn both_keys_unset_do_not_serialize() {
    let yaml = serde_yaml::to_string(&Style::default()).expect("yaml");
    assert!(!yaml.contains("textSpacingTrim"), "got: {yaml}");
    assert!(!yaml.contains("hangingPunctuation"), "got: {yaml}");
}

#[test]
fn text_spacing_trim_rejects_unknown_variant() {
    let err = serde_yaml::from_str::<Style>("textSpacingTrim: zzz\n");
    assert!(err.is_err(), "unknown textSpacingTrim value must reject");
}

#[test]
fn hanging_punctuation_rejects_unknown_variant() {
    let err = serde_yaml::from_str::<Style>("hangingPunctuation: zzz\n");
    assert!(err.is_err(), "unknown hangingPunctuation value must reject");
}

#[test]
fn both_keys_are_span_inert() {
    let s = Style {
        text_spacing_trim: Some(TextSpacingTrim::Normal),
        hanging_punctuation: Some(HangingPunctuation::AllowEnd),
        ..Style::default()
    };
    let ignored = s.ignored_span_keys();
    assert!(ignored.contains(&"textSpacingTrim"), "got: {ignored:?}");
    assert!(ignored.contains(&"hangingPunctuation"), "got: {ignored:?}");
}
