//! Border wire: scalar/map parse, round-trip, rejections, side helpers.

use super::*;

fn width(yaml: &str) -> Result<BorderWidth, crate::yaml::YamlError> {
    crate::yaml::from_str(yaml)
}

fn style(yaml: &str) -> Result<BorderStyle, crate::yaml::YamlError> {
    crate::yaml::from_str(yaml)
}

#[test]
fn scalar_width_parses_and_round_trips_bare() {
    let w = width("0.5").expect("scalar");
    assert_eq!(w, BorderWidth::All(0.5));
    assert_eq!(w.uniform(), Some(0.5));
    assert_eq!(w.sides(), [0.5; 4]);
    assert_eq!(crate::yaml::to_string(&w).expect("yaml").trim(), "0.5");
}

#[test]
fn per_side_width_parses_and_round_trips_only_set_keys() {
    let w = width("{ top: 2, bottom: 0.5 }").expect("map");
    assert_eq!(w.uniform(), None);
    assert_eq!(w.sides(), [2.0, 0.0, 0.5, 0.0]);
    let out = crate::yaml::to_string(&w).expect("yaml");
    assert!(out.contains("top: 2") && out.contains("bottom: 0.5"));
    assert!(!out.contains("right") && !out.contains("left"));
}

#[test]
fn negative_widths_are_rejected_in_both_forms() {
    let e = width("-1").expect_err("negative scalar");
    assert!(e.to_string().contains("not be negative"));
    assert!(width("{ top: -0.5 }").is_err());
}

#[test]
fn unknown_side_keys_are_rejected_with_the_side_list() {
    let e = width("{ up: 1 }").expect_err("unknown side");
    assert!(e.to_string().contains("top/right/bottom/left"), "{e}");
}

#[test]
fn wrong_width_shape_names_the_accepted_forms() {
    let e = width("\"2pt\"").expect_err("string width");
    assert!(e.to_string().contains("border width in pt"), "{e}");
}

#[test]
fn color_scalar_and_map_round_trip() {
    let c: BorderColor = crate::yaml::from_str("\"#ff0000\"").expect("scalar");
    assert_eq!(c.sides()[3].as_deref(), Some("#ff0000"));
    assert_eq!(
        crate::yaml::to_string(&c).expect("yaml").trim(),
        "\"#ff0000\""
    );
    let c: BorderColor = crate::yaml::from_str("{ left: \"#00ff00\" }").expect("map");
    let sides = c.sides();
    assert_eq!(sides[3].as_deref(), Some("#00ff00"));
    assert!(sides[0].is_none());
    let e = crate::yaml::from_str::<BorderColor>("5").expect_err("number color");
    assert!(e.to_string().contains("#rrggbb"), "{e}");
}

#[test]
fn style_keywords_map_and_rejections() {
    let s: BorderStyle = crate::yaml::from_str("double").expect("keyword");
    assert_eq!(s.sides(), [BorderStyleKind::Double; 4]);
    assert_eq!(crate::yaml::to_string(&s).expect("yaml").trim(), "double");
    let s: BorderStyle = crate::yaml::from_str("{ bottom: double }").expect("map");
    assert_eq!(
        s.sides(),
        [
            BorderStyleKind::Solid,
            BorderStyleKind::Solid,
            BorderStyleKind::Double,
            BorderStyleKind::Solid,
        ]
    );
    let out = crate::yaml::to_string(&s).expect("yaml");
    assert!(out.contains("bottom: double") && !out.contains("top"));
    let e = crate::yaml::from_str::<BorderStyle>("wavy").expect_err("unknown keyword");
    assert!(
        e.to_string().contains("solid, double, dashed or dotted"),
        "the error must name every accepted keyword: {e}"
    );
    // The two patterned keywords parse in both the scalar and map forms.
    assert_eq!(
        style("dashed").expect("dashed"),
        BorderStyle::All(BorderStyleKind::Dashed)
    );
    assert_eq!(
        style("{ left: dotted }").expect("dotted side").sides(),
        [
            BorderStyleKind::Solid,
            BorderStyleKind::Solid,
            BorderStyleKind::Solid,
            BorderStyleKind::Dotted,
        ]
    );
}

#[test]
fn integer_widths_parse_via_the_numeric_visitors() {
    assert_eq!(width("2").expect("u64"), BorderWidth::All(2.0));
    // A YAML explicit negative integer routes through visit_i64.
    assert!(width("-2").is_err());
}

#[test]
fn wrong_style_shape_names_the_accepted_forms() {
    let e = crate::yaml::from_str::<BorderStyle>("5").expect_err("number style");
    assert!(e.to_string().contains("solid | double"), "{e}");
}

#[test]
fn border_radius_round_trips_its_authored_form() {
    // The Designer's touched-keys write policy rides on this: the node
    // alone serializes back to exactly what the author wrote.
    let s: crate::style::Style = crate::yaml::from_str("borderRadius: \"50%\"").expect("style");
    let out = crate::yaml::to_string(&s).expect("yaml");
    assert_eq!(out.trim(), "borderRadius: 50%");
    let pt: crate::style::Style = crate::yaml::from_str("borderRadius: 6").expect("style");
    // A bare number serializes as the engine-canonical float form (`6.0`,
    // like every other bare length), never re-quoted or re-united.
    let out = crate::yaml::to_string(&pt).expect("yaml");
    assert!(out.contains("borderRadius: 6"), "{out}");
    // Unset never serializes.
    assert!(
        !crate::yaml::to_string(&crate::style::Style::default())
            .expect("yaml")
            .contains("borderRadius")
    );
}

#[test]
fn line_style_keyword_round_trips_and_defaults_solid() {
    let l: crate::LineStyle = crate::yaml::from_str("{ width: 0.8, style: dashed }").expect("line");
    assert_eq!(l.style(), BorderStyleKind::Dashed);
    let out = crate::yaml::to_string(&l).expect("yaml");
    assert!(out.contains("style: dashed"), "{out}");
    // Unset keeps the accessor default and never serializes.
    let bare: crate::LineStyle = crate::yaml::from_str("{ width: 1 }").expect("line");
    assert_eq!(bare.style(), BorderStyleKind::Solid);
    assert!(
        !crate::yaml::to_string(&bare)
            .expect("yaml")
            .contains("style:")
    );
}

#[test]
fn a_per_side_value_of_the_wrong_type_is_rejected_in_all_three_maps() {
    // The error names the side whose value could not be read.
    let e = width("{ top: [1] }").expect_err("a list as a width");
    assert!(e.to_string().starts_with("top:"), "{e}");
    let e = crate::yaml::from_str::<BorderColor>("{ top: [1] }").expect_err("a list as a color");
    assert!(e.to_string().starts_with("top:"), "{e}");
    let e = style("{ top: { a: 1 } }").expect_err("an unknown style keyword");
    assert!(e.to_string().starts_with("top:"), "{e}");
}

/// Deserializes `T` from a map whose only key is the integer `1`, the way a
/// non-YAML source (here serde's in-memory map deserializer) can present one;
/// the YAML reader rejects a non-string key before any `T` is built.
fn error_for_an_integer_key<T: serde::de::DeserializeOwned>() -> String {
    use serde::de::value::{Error, MapDeserializer};
    let map = MapDeserializer::<_, Error>::new(vec![(1_i32, "x")].into_iter());
    T::deserialize(map)
        .err()
        .expect("an integer key is not a side name")
        .to_string()
}

#[test]
fn a_per_side_key_that_is_not_a_string_is_rejected_in_all_three_maps() {
    for e in [
        error_for_an_integer_key::<BorderWidth>(),
        error_for_an_integer_key::<BorderColor>(),
        error_for_an_integer_key::<BorderStyle>(),
    ] {
        assert!(e.contains("expected a string"), "{e}");
    }
}

#[test]
fn unknown_side_keys_are_rejected_in_the_color_and_style_maps_too() {
    let e = crate::yaml::from_str::<BorderColor>("{ up: \"#ff0000\" }").expect_err("color map");
    assert!(e.to_string().contains("top/right/bottom/left"), "{e}");
    let e = style("{ up: solid }").expect_err("style map");
    assert!(e.to_string().contains("top/right/bottom/left"), "{e}");
}

#[test]
fn a_map_naming_all_four_sides_sets_every_side_in_all_three_maps() {
    // Every side key (top, right, bottom, left) is accepted in the same
    // map, and each value lands in its own slot.
    let w = width("{ top: 1, right: 2, bottom: 3, left: 4 }").expect("width map");
    assert_eq!(w.sides(), [1.0, 2.0, 3.0, 4.0]);
    let c: BorderColor = crate::yaml::from_str(
        "{ top: \"#111111\", right: \"#222222\", bottom: \"#333333\", left: \"#444444\" }",
    )
    .expect("color map");
    assert_eq!(
        c.sides(),
        [
            Some("#111111".to_string()),
            Some("#222222".to_string()),
            Some("#333333".to_string()),
            Some("#444444".to_string()),
        ]
    );
    let s =
        style("{ top: solid, right: double, bottom: dashed, left: dotted }").expect("style map");
    assert_eq!(
        s.sides(),
        [
            BorderStyleKind::Solid,
            BorderStyleKind::Double,
            BorderStyleKind::Dashed,
            BorderStyleKind::Dotted,
        ]
    );
}
