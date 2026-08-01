//! Border wire: scalar/map parse, round-trip, rejections, side helpers.

use super::*;

fn width(yaml: &str) -> Result<BorderWidth, serde_yaml::Error> {
    serde_yaml::from_str(yaml)
}

fn style(yaml: &str) -> Result<BorderStyle, serde_yaml::Error> {
    serde_yaml::from_str(yaml)
}

#[test]
fn scalar_width_parses_and_round_trips_bare() {
    let w = width("0.5").expect("scalar");
    assert_eq!(w, BorderWidth::All(0.5));
    assert_eq!(w.uniform(), Some(0.5));
    assert_eq!(w.sides(), [0.5; 4]);
    assert_eq!(serde_yaml::to_string(&w).expect("yaml").trim(), "0.5");
}

#[test]
fn per_side_width_parses_and_round_trips_only_set_keys() {
    let w = width("{ top: 2, bottom: 0.5 }").expect("map");
    assert_eq!(w.uniform(), None);
    assert_eq!(w.sides(), [2.0, 0.0, 0.5, 0.0]);
    let out = serde_yaml::to_string(&w).expect("yaml");
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
    let c: BorderColor = serde_yaml::from_str("\"#ff0000\"").expect("scalar");
    assert_eq!(c.sides()[3].as_deref(), Some("#ff0000"));
    assert_eq!(serde_yaml::to_string(&c).expect("yaml").trim(), "'#ff0000'");
    let c: BorderColor = serde_yaml::from_str("{ left: \"#00ff00\" }").expect("map");
    let sides = c.sides();
    assert_eq!(sides[3].as_deref(), Some("#00ff00"));
    assert!(sides[0].is_none());
    let e = serde_yaml::from_str::<BorderColor>("5").expect_err("number color");
    assert!(e.to_string().contains("#rrggbb"), "{e}");
}

#[test]
fn style_keywords_map_and_rejections() {
    let s: BorderStyle = serde_yaml::from_str("double").expect("keyword");
    assert_eq!(s.sides(), [BorderStyleKind::Double; 4]);
    assert_eq!(serde_yaml::to_string(&s).expect("yaml").trim(), "double");
    let s: BorderStyle = serde_yaml::from_str("{ bottom: double }").expect("map");
    assert_eq!(
        s.sides(),
        [
            BorderStyleKind::Solid,
            BorderStyleKind::Solid,
            BorderStyleKind::Double,
            BorderStyleKind::Solid,
        ]
    );
    let out = serde_yaml::to_string(&s).expect("yaml");
    assert!(out.contains("bottom: double") && !out.contains("top"));
    let e = serde_yaml::from_str::<BorderStyle>("wavy").expect_err("unknown keyword");
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
    let e = serde_yaml::from_str::<BorderStyle>("5").expect_err("number style");
    assert!(e.to_string().contains("solid | double"), "{e}");
}

#[test]
fn border_radius_round_trips_its_authored_form() {
    // The Designer's touched-keys write policy rides on this: the node
    // alone serializes back to exactly what the author wrote.
    let s: crate::style::Style = serde_yaml::from_str("borderRadius: \"50%\"").expect("style");
    let out = serde_yaml::to_string(&s).expect("yaml");
    assert_eq!(out.trim(), "borderRadius: 50%");
    let pt: crate::style::Style = serde_yaml::from_str("borderRadius: 6").expect("style");
    // A bare number serializes as the engine-canonical float form (`6.0`,
    // like every other bare length), never re-quoted or re-united.
    let out = serde_yaml::to_string(&pt).expect("yaml");
    assert!(out.contains("borderRadius: 6"), "{out}");
    // Unset never serializes.
    assert!(!serde_yaml::to_string(&crate::style::Style::default())
        .expect("yaml")
        .contains("borderRadius"));
}

#[test]
fn line_style_keyword_round_trips_and_defaults_solid() {
    let l: crate::LineStyle = serde_yaml::from_str("{ width: 0.8, style: dashed }").expect("line");
    assert_eq!(l.style(), BorderStyleKind::Dashed);
    let out = serde_yaml::to_string(&l).expect("yaml");
    assert!(out.contains("style: dashed"), "{out}");
    // Unset keeps the accessor default and never serializes.
    let bare: crate::LineStyle = serde_yaml::from_str("{ width: 1 }").expect("line");
    assert_eq!(bare.style(), BorderStyleKind::Solid);
    assert!(!serde_yaml::to_string(&bare)
        .expect("yaml")
        .contains("style:"));
}
