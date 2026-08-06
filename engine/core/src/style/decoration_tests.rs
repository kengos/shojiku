//! Unit tests for the wire keys: `textDecoration` and `opacity`.

use super::*;

#[test]
fn text_decoration_parses_round_trips_and_defaults_to_none() {
    for (yaml, expect) in [
        ("textDecoration: none", TextDecoration::None),
        ("textDecoration: underline", TextDecoration::Underline),
        ("textDecoration: line_through", TextDecoration::LineThrough),
    ] {
        let s: Style = serde_yaml::from_str(yaml).expect("parse");
        assert_eq!(s.text_decoration, Some(expect), "{yaml}");
    }
    assert_eq!(TextDecoration::default(), TextDecoration::None);
    let s = Style {
        text_decoration: Some(TextDecoration::LineThrough),
        ..Style::default()
    };
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("textDecoration: line_through"), "got: {yaml}");
    assert!(!s.is_empty());
    // Copy-derived clone/Debug are separate llvm-cov functions.
    #[allow(clippy::clone_on_copy)]
    let d = TextDecoration::Underline.clone();
    assert_eq!(format!("{d:?}"), "Underline");
}

#[test]
fn text_decoration_rejects_css_spellings_we_do_not_support() {
    // Kebab-case (raw CSS), the shorthand, and multi-value lines must be
    // parse errors, not silent no-ops.
    for bad in [
        "textDecoration: line-through",
        "textDecoration: overline",
        "textDecoration: underline line_through",
        "textDecorationLine: underline",
    ] {
        assert!(
            serde_yaml::from_str::<Style>(bad).is_err(),
            "expected rejection of `{bad}`"
        );
    }
}

#[test]
fn opacity_parses_and_round_trips() {
    let s: Style = serde_yaml::from_str("opacity: 0.5").expect("parse");
    assert_eq!(s.opacity, Some(0.5));
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("opacity: 0.5"), "got: {yaml}");
    // Out-of-range parses (the clamp + warning live in layout, like
    // letterSpacing's range guard).
    let s: Style = serde_yaml::from_str("opacity: 7").expect("parse");
    assert_eq!(s.opacity, Some(7.0));
    // Unset never serializes.
    let yaml = serde_yaml::to_string(&Style::default()).expect("yaml");
    assert!(!yaml.contains("opacity"), "got: {yaml}");
}

#[test]
fn ignored_shape_keys_names_the_inert_set_and_passes_the_honored_one() {
    // Every shape-inert key set → all names, in wire spelling.
    let all = serde_yaml::from_str::<Style>(
        "{ fontSize: 12, fontFamily: f, fontWeight: bold, fontStyle: italic, \
           letterSpacing: 1, lineHeight: 2, color: '#112233', textAlign: right, \
           verticalAlign: middle, lineBreak: anywhere, textSpacingTrim: normal, \
           hangingPunctuation: force_end, textOverflow: clip, overflow: hidden, \
           textDecoration: underline, writingMode: vertical_rl, textOrientation: upright }",
    )
    .expect("style");
    assert_eq!(
        all.ignored_shape_keys(),
        vec![
            "fontSize",
            "fontFamily",
            "fontWeight",
            "fontStyle",
            "letterSpacing",
            "lineHeight",
            "color",
            "textAlign",
            "verticalAlign",
            "lineBreak",
            "textSpacingTrim",
            "hangingPunctuation",
            "textOverflow",
            "overflow",
            "textDecoration",
            "writingMode",
            "textOrientation",
        ]
    );
    // The decoration subset shapes honor is never flagged.
    let honored = serde_yaml::from_str::<Style>(
        "{ backgroundColor: '#eeeeee', borderWidth: 2, borderColor: '#000000', \
           borderStyle: double, opacity: 0.5 }",
    )
    .expect("style");
    assert!(honored.ignored_shape_keys().is_empty());
}

#[test]
fn line_style_takes_opacity_without_serializing_defaults() {
    let l: LineStyle = serde_yaml::from_str("opacity: 0.25\nwidth: 2").expect("parse");
    assert_eq!(l.opacity, Some(0.25));
    assert!(LineStyle::default().opacity.is_none());
    // Unset opacity stays out of the serialized form (round-trip).
    let yaml = serde_yaml::to_string(&LineStyle::default()).expect("yaml");
    assert!(!yaml.contains("opacity"), "got: {yaml}");
}
