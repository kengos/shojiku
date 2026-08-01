//! Parse / round-trip coverage for the `lineBreak` variants, in particular
//! the CSS `strict` / `loose` values and unknown-variant rejection.

use super::*;

#[test]
fn line_break_strict_and_loose_round_trip() {
    for (variant, spelling) in [(LineBreak::Strict, "strict"), (LineBreak::Loose, "loose")] {
        let s = Style {
            line_break: Some(variant),
            ..Style::default()
        };
        let yaml = serde_yaml::to_string(&s).expect("yaml");
        assert!(
            yaml.contains(&format!("lineBreak: {spelling}")),
            "got: {yaml}"
        );
        let back: Style = serde_yaml::from_str(&yaml).expect("parse");
        assert_eq!(back.line_break, Some(variant));
    }
}

#[test]
fn line_break_normal_still_parses() {
    let s: Style = serde_yaml::from_str("lineBreak: normal\n").expect("parse");
    assert_eq!(s.line_break, Some(LineBreak::Normal));
}

#[test]
fn line_break_rejects_unknown_variant() {
    let err = serde_yaml::from_str::<Style>("lineBreak: zzz\n");
    assert!(err.is_err(), "unknown lineBreak value must reject");
}
