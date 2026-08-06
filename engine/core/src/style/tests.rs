//! Unit tests for the `Style` property bag and paint styles.

use super::*;

#[test]
fn style_default_is_all_unset() {
    assert_eq!(Style::default(), Style::default());
    let d = Style::default();
    assert!(d.font_size.is_none());
    assert!(d.font_family.is_none());
    assert!(d.line_height.is_none());
    assert!(d.color.is_none());
    assert!(d.text_align.is_none());
    assert!(d.vertical_align.is_none());
    assert!(d.line_break.is_none());
    assert!(d.background_color.is_none());
    assert!(d.border_width.is_none());
    assert!(d.border_color.is_none());
    assert!(d.text_overflow.is_none());
    assert!(d.font_weight.is_none());
    assert!(d.font_style.is_none());
    assert!(d.letter_spacing.is_none());
}

#[test]
fn border_properties_round_trip_as_camel_case() {
    let s = Style {
        border_width: Some(BorderWidth::All(0.8)),
        border_color: Some(BorderColor::All("#333333".into())),
        ..Style::default()
    };
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("borderWidth: 0.8"), "got: {yaml}");
    assert!(yaml.contains("borderColor: '#333333'"), "got: {yaml}");
    let back: Style = serde_yaml::from_str(&yaml).expect("parse");
    assert_eq!(back.border_width, Some(BorderWidth::All(0.8)));
    assert_eq!(back.border_color, Some(BorderColor::All("#333333".into())));
    // A style with only borders set is not empty (it serializes).
    assert!(!s.is_empty());
}

#[test]
fn text_overflow_parses_round_trips_and_defaults_to_visible() {
    for (yaml, expect) in [
        ("textOverflow: visible", TextOverflow::Visible),
        ("textOverflow: shrink", TextOverflow::Shrink),
        ("textOverflow: ellipsis", TextOverflow::Ellipsis),
        // `clip` is a real value, no longer merely reserved.
        ("textOverflow: clip", TextOverflow::Clip),
    ] {
        let s: Style = serde_yaml::from_str(yaml).expect("parse");
        assert_eq!(s.text_overflow, Some(expect), "{yaml}");
    }
    assert_eq!(TextOverflow::default(), TextOverflow::Visible);
    let s = Style {
        text_overflow: Some(TextOverflow::Ellipsis),
        ..Style::default()
    };
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("textOverflow: ellipsis"), "got: {yaml}");
    assert!(!s.is_empty());
}

#[test]
fn unknown_text_overflow_values_are_rejected() {
    // `hidden` belongs to `overflow`, not `textOverflow` — keep the two
    // vocabularies typo-safe against each other.
    for yaml in ["textOverflow: hidden", "textOverflow: truncate"] {
        let e = serde_yaml::from_str::<Style>(yaml).expect_err("must reject");
        assert!(e.to_string().contains("unknown variant"), "got: {e}");
    }
}

#[test]
fn overflow_parses_round_trips_and_rejects_unknown_values() {
    for (yaml, expect) in [
        ("overflow: visible", Overflow::Visible),
        ("overflow: hidden", Overflow::Hidden),
    ] {
        let s: Style = serde_yaml::from_str(yaml).expect("parse");
        assert_eq!(s.overflow, Some(expect), "{yaml}");
    }
    assert_eq!(Overflow::default(), Overflow::Visible);
    let s = Style {
        overflow: Some(Overflow::Hidden),
        ..Style::default()
    };
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("overflow: hidden"), "got: {yaml}");
    assert!(!s.is_empty());
    // `scroll`/`auto` exist in CSS but have no meaning on paper; `clip`
    // belongs to `textOverflow`.
    for yaml in ["overflow: scroll", "overflow: auto", "overflow: clip"] {
        let e = serde_yaml::from_str::<Style>(yaml).expect_err("must reject");
        assert!(e.to_string().contains("unknown variant"), "got: {e}");
    }
}

#[test]
fn unknown_border_keys_are_rejected() {
    // CSS spellings we deliberately do not support must be parse errors,
    // not silent no-ops (`deny_unknown_fields`). The `border:` shorthand
    // is a string mini-grammar — per-side maps are the supported form.
    for yaml in ["border: 1pt solid black", "borderTopWidth: 1"] {
        let e = serde_yaml::from_str::<Style>(yaml).expect_err("must reject");
        assert!(e.to_string().contains("unknown field"), "got: {e}");
    }
}

#[test]
fn border_side_maps_parse_on_a_style() {
    let s: Style = serde_yaml::from_str(
        "{ borderWidth: { top: 2 }, borderColor: { top: \"#f00\" }, borderStyle: { top: double } }",
    )
    .expect("style");
    assert_eq!(
        s.border_width,
        Some(BorderWidth::PerSide([Some(2.0), None, None, None]))
    );
    assert!(matches!(s.border_style, Some(BorderStyle::PerSide(_))));
    // Round-trip keeps the authored per-side form.
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(
        yaml.contains("top: 2") && yaml.contains("top: double"),
        "got: {yaml}"
    );
}

#[test]
fn background_color_round_trips_as_camel_case() {
    let s = Style {
        background_color: Some("#eef".into()),
        ..Style::default()
    };
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("backgroundColor: '#eef'"), "got: {yaml}");
    let back: Style = serde_yaml::from_str(&yaml).expect("parse");
    assert_eq!(back.background_color.as_deref(), Some("#eef"));
}

#[test]
fn style_serialization_skips_unset_and_uses_camel_case() {
    let s = Style {
        font_size: Some(Length::Pt(12.0)),
        text_align: Some(TextAlign::Right),
        vertical_align: Some(VerticalAlign::Middle),
        font_family: Some("gothic".into()),
        line_break: Some(LineBreak::Anywhere),
        ..Style::default()
    };
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("fontSize: 12.0"), "got: {yaml}");
    assert!(yaml.contains("textAlign: right"), "got: {yaml}");
    assert!(yaml.contains("verticalAlign: middle"), "got: {yaml}");
    assert!(yaml.contains("fontFamily: gothic"), "got: {yaml}");
    assert!(yaml.contains("lineBreak: anywhere"), "got: {yaml}");
    // Unset fields never appear.
    assert!(!yaml.contains("color"), "got: {yaml}");
    assert!(!yaml.contains("lineHeight"), "got: {yaml}");
    assert!(!yaml.contains("fontWeight"), "got: {yaml}");
    assert!(!yaml.contains("fontStyle"), "got: {yaml}");
    assert!(!yaml.contains("letterSpacing"), "got: {yaml}");
    assert!(!yaml.contains("borderWidth"), "got: {yaml}");
    assert!(!yaml.contains("borderColor"), "got: {yaml}");
}

#[test]
fn style_parses_camel_case_names() {
    let s: Style = serde_yaml::from_str(
        "textAlign: center\nverticalAlign: bottom\nfontFamily: mincho\nfontSize: 9\nlineHeight: 1.2\ncolor: '#ff0000'\n",
    )
    .expect("parse");
    assert_eq!(s.text_align, Some(TextAlign::Center));
    assert_eq!(s.vertical_align, Some(VerticalAlign::Bottom));
    assert_eq!(s.font_family.as_deref(), Some("mincho"));
    assert_eq!(s.font_size, Some(Length::Pt(9.0)));
    assert_eq!(s.line_height, Some(1.2));
    assert_eq!(s.color.as_deref(), Some("#ff0000"));
}

#[test]
fn font_properties_round_trip_as_camel_case() {
    let s: Style =
        serde_yaml::from_str("fontWeight: bold\nfontStyle: italic\nletterSpacing: 1.5\n")
            .expect("parse");
    assert_eq!(s.font_weight, Some(FontWeight::Bold));
    assert_eq!(s.font_style, Some(FontStyle::Italic));
    assert_eq!(s.letter_spacing, Some(Length::Pt(1.5)));
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("fontWeight: bold"), "got: {yaml}");
    assert!(yaml.contains("fontStyle: italic"), "got: {yaml}");
    assert!(yaml.contains("letterSpacing: 1.5"), "got: {yaml}");
}

#[test]
fn font_property_keywords_are_the_css_subset_only() {
    // Unknown enum values are parse errors, not silent fallbacks.
    for bad in ["fontWeight: heavy", "fontWeight: 700", "fontStyle: oblique"] {
        assert!(
            serde_yaml::from_str::<Style>(bad).is_err(),
            "expected rejection of `{bad}`"
        );
    }
    // The explicit `normal` keywords parse.
    let s: Style = serde_yaml::from_str("fontWeight: normal\nfontStyle: normal\n").expect("parse");
    assert_eq!(s.font_weight, Some(FontWeight::Normal));
    assert_eq!(s.font_style, Some(FontStyle::Normal));
}

#[test]
fn font_variant_enums_have_css_initial_defaults() {
    assert_eq!(FontWeight::default(), FontWeight::Normal);
    assert_eq!(FontStyle::default(), FontStyle::Normal);
    // Copy-derived `clone` and `Debug` are separate functions under
    // llvm-cov; exercise them so the per-crate 100% gate holds.
    #[allow(clippy::clone_on_copy)]
    let (w, s) = (FontWeight::Bold.clone(), FontStyle::Italic.clone());
    assert_eq!(format!("{w:?}{s:?}"), "BoldItalic");
}

#[test]
fn negative_letter_spacing_parses() {
    // CSS allows negative letter-spacing (tightening); the range guard
    // lives in layout, not the parser.
    let s: Style = serde_yaml::from_str("letterSpacing: -0.5").expect("parse");
    assert_eq!(s.letter_spacing, Some(Length::Pt(-0.5)));
}

#[test]
fn old_pre_rename_keys_are_rejected() {
    // Hard rename: the pre-1.0 names must not silently survive.
    for old in ["align: right", "valign: middle", "font: gothic"] {
        assert!(
            serde_yaml::from_str::<Style>(old).is_err(),
            "expected rejection of `{old}`"
        );
    }
}

#[test]
fn line_style_keeps_concrete_defaults() {
    assert_eq!(LineStyle::default().width(), 1.0);
    assert!(LineStyle::default().color.is_none());
}

#[test]
fn line_style_serializes_only_authored_keys() {
    // GUI round-trip: an unset stroke width must not be injected into the
    // output (`color`-only stays `color`-only).
    let line: LineStyle = serde_yaml::from_str("color: \"#0000ff\"").expect("line style");
    let out = serde_yaml::to_string(&line).expect("serialize");
    assert!(!out.contains("width"), "injected default: {out}");
    assert_eq!(line.width(), 1.0);
}

#[test]
fn ignored_span_keys_names_exactly_the_inert_set() {
    // Every span-inert key set → all names, in wire spelling.
    let all = serde_yaml::from_str::<Style>(
        "{ lineHeight: 2, textAlign: right, verticalAlign: middle, lineBreak: anywhere, \
           backgroundColor: '#eeeeee', borderWidth: 1, borderColor: '#000000', \
           textOverflow: clip, overflow: hidden, opacity: 0.5 }",
    )
    .expect("style");
    assert_eq!(
        all.ignored_span_keys(),
        vec![
            "lineHeight",
            "textAlign",
            "verticalAlign",
            "lineBreak",
            "backgroundColor",
            "borderWidth",
            "borderColor",
            "textOverflow",
            "overflow",
            "opacity",
        ]
    );
    // The span-honored properties never appear.
    let honored = serde_yaml::from_str::<Style>(
        "{ fontSize: 12, fontFamily: f, fontWeight: bold, fontStyle: italic, \
           letterSpacing: 1, color: '#333333', textDecoration: underline }",
    )
    .expect("style");
    assert!(honored.ignored_span_keys().is_empty());
}
