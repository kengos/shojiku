//! Parse / round-trip / rejection coverage for the vertical-writing keys
//! `writingMode` and `textOrientation`, plus their span-inert listing in
//! [`Style::ignored_span_keys`].

use super::*;

#[test]
fn writing_mode_variants_round_trip() {
    for (variant, spelling) in [
        (WritingMode::HorizontalTb, "horizontal_tb"),
        (WritingMode::VerticalRl, "vertical_rl"),
    ] {
        let s = Style {
            writing_mode: Some(variant),
            ..Style::default()
        };
        let yaml = serde_yaml::to_string(&s).expect("yaml");
        assert!(
            yaml.contains(&format!("writingMode: {spelling}")),
            "got: {yaml}"
        );
        let back: Style = serde_yaml::from_str(&yaml).expect("parse");
        assert_eq!(back.writing_mode, Some(variant));
    }
}

#[test]
fn text_orientation_variants_round_trip() {
    for (variant, spelling) in [
        (TextOrientation::Mixed, "mixed"),
        (TextOrientation::Upright, "upright"),
    ] {
        let s = Style {
            text_orientation: Some(variant),
            ..Style::default()
        };
        let yaml = serde_yaml::to_string(&s).expect("yaml");
        assert!(
            yaml.contains(&format!("textOrientation: {spelling}")),
            "got: {yaml}"
        );
        let back: Style = serde_yaml::from_str(&yaml).expect("parse");
        assert_eq!(back.text_orientation, Some(variant));
    }
}

#[test]
fn default_variants_are_horizontal_and_mixed() {
    assert_eq!(WritingMode::default(), WritingMode::HorizontalTb);
    assert_eq!(TextOrientation::default(), TextOrientation::Mixed);
}

#[test]
fn both_keys_unset_do_not_serialize() {
    let yaml = serde_yaml::to_string(&Style::default()).expect("yaml");
    assert!(!yaml.contains("writingMode"), "got: {yaml}");
    assert!(!yaml.contains("textOrientation"), "got: {yaml}");
}

#[test]
fn writing_mode_rejects_unknown_variant() {
    let err = serde_yaml::from_str::<Style>("writingMode: sideways\n");
    assert!(err.is_err(), "unknown writingMode value must reject");
}

#[test]
fn text_orientation_rejects_unknown_variant() {
    let err = serde_yaml::from_str::<Style>("textOrientation: slanted\n");
    assert!(err.is_err(), "unknown textOrientation value must reject");
}

#[test]
fn both_keys_are_span_inert() {
    let s = Style {
        writing_mode: Some(WritingMode::VerticalRl),
        text_orientation: Some(TextOrientation::Upright),
        ..Style::default()
    };
    let ignored = s.ignored_span_keys();
    assert!(ignored.contains(&"writingMode"), "got: {ignored:?}");
    assert!(ignored.contains(&"textOrientation"), "got: {ignored:?}");
}

#[test]
fn text_combine_upright_none_round_trips_as_keyword() {
    let s = Style {
        text_combine_upright: Some(TextCombineUpright::None),
        ..Style::default()
    };
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("textCombineUpright: none"), "got: {yaml}");
    let back: Style = serde_yaml::from_str(&yaml).expect("parse");
    assert_eq!(back.text_combine_upright, Some(TextCombineUpright::None));
    assert_eq!(TextCombineUpright::None.digits(), None);
    // The `to_value` serializer is a second Serialize instantiation
    // (used by wire tests elsewhere); exercise it too.
    let v = serde_yaml::to_value(&s).expect("value");
    assert_eq!(v["textCombineUpright"], serde_yaml::Value::from("none"));
}

#[test]
fn text_combine_upright_digits_round_trips_as_map() {
    for n in 2..=4u8 {
        let s = Style {
            text_combine_upright: Some(TextCombineUpright::Digits(n)),
            ..Style::default()
        };
        let yaml = serde_yaml::to_string(&s).expect("yaml");
        assert!(yaml.contains(&format!("digits: {n}")), "got: {yaml}");
        let back: Style = serde_yaml::from_str(&yaml).expect("parse");
        assert_eq!(
            back.text_combine_upright,
            Some(TextCombineUpright::Digits(n))
        );
        assert_eq!(back.text_combine_upright.unwrap().digits(), Some(n));
        // Exercise the `to_value` serializer instantiation's map arm too.
        let v = serde_yaml::to_value(&s).expect("value");
        assert_eq!(
            v["textCombineUpright"]["digits"],
            serde_yaml::Value::from(n)
        );
    }
}

#[test]
fn text_combine_upright_rejects_out_of_range_digits() {
    for bad in ["{ digits: 1 }", "{ digits: 5 }", "{ digits: 99 }"] {
        let yaml = format!("textCombineUpright: {bad}\n");
        assert!(
            serde_yaml::from_str::<Style>(&yaml).is_err(),
            "digits outside 2..=4 must reject: {bad}"
        );
    }
}

#[test]
fn text_combine_upright_rejects_malformed_forms() {
    for bad in [
        "both",         // an unknown keyword is a located parse error
        "{ digit: 2 }", // typo key
        "{ digits: 2, x: 1 }",
        "{ }",
    ] {
        let yaml = format!("textCombineUpright: {bad}\n");
        assert!(
            serde_yaml::from_str::<Style>(&yaml).is_err(),
            "malformed textCombineUpright must reject: {bad}"
        );
    }
}

#[test]
fn text_combine_upright_unset_does_not_serialize() {
    let yaml = serde_yaml::to_string(&Style::default()).expect("yaml");
    assert!(!yaml.contains("textCombineUpright"), "got: {yaml}");
}

#[test]
fn text_combine_upright_is_shape_inert_but_span_honored() {
    // Spans honor 縦中横 per span (the cascade carries it); shapes have
    // no text to combine, so the shape check still flags it.
    let s = Style {
        text_combine_upright: Some(TextCombineUpright::Digits(2)),
        ..Style::default()
    };
    assert!(!s.ignored_span_keys().contains(&"textCombineUpright"));
    assert!(s.ignored_shape_keys().contains(&"textCombineUpright"));
}

#[test]
fn text_combine_upright_rejects_a_non_keyword_non_map_value() {
    // A bare scalar is neither form; the visitor's `expecting` names both.
    let err = serde_yaml::from_str::<Style>("textCombineUpright: 5\n")
        .expect_err("a bare number must reject");
    assert!(err.to_string().contains("digits"), "got: {err}");
}

#[test]
fn text_combine_upright_rejects_a_duplicate_digits_key() {
    // YAML pre-rejects duplicate mapping keys, so drive the visitor
    // through JSON (which streams both entries into `visit_map`).
    let err = serde_json::from_str::<Style>(r#"{"textCombineUpright":{"digits":2,"digits":3}}"#)
        .expect_err("a duplicate digits key must reject");
    assert!(err.to_string().contains("duplicate"), "got: {err}");
}

#[test]
fn text_combine_upright_rejects_a_non_scalar_digits_value() {
    // `digits: []` fails inside `next_value` — the mid-map error path.
    let err = serde_yaml::from_str::<Style>("textCombineUpright: { digits: [] }\n");
    assert!(err.is_err(), "a non-scalar digits value must reject");
}

#[test]
fn text_combine_upright_rejects_a_non_string_map_key() {
    // A YAML complex key fails inside `next_key::<String>` — the other
    // mid-map error path.
    let err = serde_yaml::from_str::<Style>("textCombineUpright: { ? [1, 2] : 3 }\n");
    assert!(err.is_err(), "a non-string key must reject");
}

#[test]
fn text_combine_upright_parses_through_the_template_pipeline() {
    // The real template parse (two-pass: serde_path_to_error + the
    // buffering Content deserializer) is a different set of serde
    // instantiations than a bare `from_str`; exercise both forms there.
    let tpl = crate::parse_template(
        "sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: a\n        style: { writingMode: vertical_rl, textCombineUpright: { digits: 2 } }\n",
    )
    .expect("template");
    let crate::Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let crate::Item::Text(text) = &flow.items[0] else { panic!("expected text") };
    assert_eq!(
        text.style.text_combine_upright,
        Some(TextCombineUpright::Digits(2))
    );

    let none = crate::parse_template(
        "sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: a\n        style: { textCombineUpright: none }\n",
    )
    .expect("template");
    let crate::Body::Flow(flow) = &none.sections.body else { panic!("expected flow") };
    let crate::Item::Text(text) = &flow.items[0] else { panic!("expected text") };
    assert_eq!(
        text.style.text_combine_upright,
        Some(TextCombineUpright::None)
    );

    let err = crate::parse_template(
        "sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: a\n        style: { textCombineUpright: { digits: 9 } }\n",
    );
    assert!(err.is_err(), "out-of-range digits rejects via the pipeline");

    // A `styles:` registry entry sits OUTSIDE the internally-tagged item
    // buffering, so it deserializes through the live path-tracking
    // deserializer — yet another serde instantiation.
    let reg = crate::parse_template(
        "styles:\n  tcy: { textCombineUpright: { digits: 3 } }\nsections:\n  body:\n    type: flow\n    items: []\n",
    )
    .expect("template");
    assert_eq!(
        reg.styles["tcy"].text_combine_upright,
        Some(TextCombineUpright::Digits(3))
    );
}

#[test]
fn text_combine_upright_parses_the_none_keyword_from_json() {
    // The JSON deserializer's string path (`visit_str` with a JSON error
    // type) — params-adjacent surfaces parse JSON.
    let s: Style = serde_json::from_str(r#"{"textCombineUpright":"none"}"#).expect("parse");
    assert_eq!(s.text_combine_upright, Some(TextCombineUpright::None));
}
