//! Wire-shape tests for `ellipse` / `checkbox`: parse, the scalar-only
//! `equals` predicate, `deny_unknown_fields`, and authored-form round-trip.

use super::*;
use crate::template::Item;

fn item(yaml: &str) -> Item {
    serde_yaml::from_str(yaml).expect("parse item")
}

#[test]
fn parses_ellipse_with_string_equals() {
    let Item::Ellipse(e) = item(
        "type: ellipse\nbox: { x: 1, y: 2, w: 20, h: 14 }\ndata: { key: payment, equals: \"カード\" }",
    ) else {
        panic!("expected ellipse");
    };
    let binding = e.data.expect("data");
    assert_eq!(binding.key, "payment");
    assert_eq!(
        binding.equals,
        Some(EqualsValue(serde_json::json!("カード")))
    );
}

#[test]
fn parses_checkbox_static_checked() {
    let Item::Checkbox(c) =
        item("type: checkbox\nbox: { x: 1, y: 2, w: 10, h: 10 }\nchecked: true")
    else {
        panic!("expected checkbox");
    };
    assert_eq!(c.checked, Some(true));
    assert!(c.data.is_none());
}

#[test]
fn equals_accepts_number_and_bool() {
    let Item::Checkbox(c) =
        item("type: checkbox\nbox: { x: 0, y: 0, w: 8, h: 8 }\ndata: { key: n, equals: 2 }")
    else {
        panic!("checkbox");
    };
    assert_eq!(
        c.data.unwrap().equals,
        Some(EqualsValue(serde_json::json!(2)))
    );
    let Item::Ellipse(e) =
        item("type: ellipse\nbox: { x: 0, y: 0, w: 8, h: 8 }\ndata: { key: b, equals: true }")
    else {
        panic!("ellipse");
    };
    assert_eq!(
        e.data.unwrap().equals,
        Some(EqualsValue(serde_json::json!(true)))
    );
}

#[test]
fn equals_rejects_non_scalar() {
    for bad in ["equals: [1, 2]", "equals: { a: 1 }"] {
        let yaml =
            format!("type: ellipse\nbox: {{ x: 0, y: 0, w: 8, h: 8 }}\ndata: {{ key: k, {bad} }}");
        assert!(
            serde_yaml::from_str::<Item>(&yaml).is_err(),
            "should reject {bad}"
        );
    }
}

#[test]
fn equals_null_is_absent() {
    // Standard serde: an explicit null on the Option is `None` — i.e. a
    // boolean binding, not an error.
    let Item::Ellipse(e) =
        item("type: ellipse\nbox: { x: 0, y: 0, w: 8, h: 8 }\ndata: { key: k, equals: null }")
    else {
        panic!("ellipse");
    };
    assert!(e.data.unwrap().equals.is_none());
}

#[test]
fn mark_binding_without_equals() {
    let Item::Checkbox(c) =
        item("type: checkbox\nbox: { x: 0, y: 0, w: 8, h: 8 }\ndata: { key: agree }")
    else {
        panic!("checkbox");
    };
    let binding = c.data.unwrap();
    assert_eq!(binding.key, "agree");
    assert!(binding.equals.is_none());
}

#[test]
fn rejects_unknown_field() {
    assert!(serde_yaml::from_str::<Item>(
        "type: ellipse\nbox: { x: 0, y: 0, w: 8, h: 8 }\nbogus: 1"
    )
    .is_err());
    assert!(serde_yaml::from_str::<Item>(
        "type: checkbox\nbox: { x: 0, y: 0, w: 8, h: 8 }\ndata: { key: k, nope: 1 }"
    )
    .is_err());
}

#[test]
fn plain_ellipse_needs_no_data() {
    let Item::Ellipse(e) = item("type: ellipse\nbox: { x: 0, y: 0, w: 60, h: 30 }") else {
        panic!("ellipse");
    };
    assert!(e.data.is_none());
    assert!(e.style.is_empty() && e.style_names.is_empty());
}

#[test]
fn id_is_exposed_via_the_item_accessor() {
    assert_eq!(
        item("type: ellipse\nid: g\nbox: { x: 0, y: 0, w: 8, h: 8 }").id(),
        Some("g")
    );
    assert_eq!(
        item("type: checkbox\nid: c\nbox: { x: 0, y: 0, w: 8, h: 8 }").id(),
        Some("c")
    );
}

#[test]
fn number_equals_round_trips_as_integer() {
    let e: EllipseItem =
        serde_yaml::from_str("box: { x: 0, y: 0, w: 8, h: 8 }\ndata: { key: k, equals: 0 }")
            .expect("parse");
    let out = serde_yaml::to_string(&e).expect("serialize");
    assert!(out.contains("equals: 0"), "got: {out}");
    assert!(!out.contains("equals: 0.0"), "got: {out}");
}

#[test]
fn text_item_parses_an_anchored_mark() {
    let Item::Text(t) = item(
        "type: text\ntext: 現金\nmark: { data: { key: payment, equals: cash }, \
         padding: 3, style: { borderColor: \"#cc0000\" } }",
    ) else {
        panic!("expected text");
    };
    let mark = t.mark.expect("mark");
    assert_eq!(mark.data.as_ref().expect("data").key, "payment");
    assert_eq!(mark.padding, Some(crate::length::Length::Pt(3.0)));
    // The unified Style's borderColor (scalar form) carries the color.
    let color = mark.style.border_color.as_ref().expect("borderColor");
    assert_eq!(color.sides()[0].as_deref(), Some("#cc0000"));
}

#[test]
fn a_mark_with_no_data_or_padding_injects_no_defaults() {
    let Item::Text(t) = item("type: text\ntext: hi\nmark: {}") else {
        panic!("text");
    };
    let mark = t.mark.expect("mark");
    assert!(mark.data.is_none() && mark.padding.is_none() && mark.style.is_empty());
    // Only the set key round-trips — an empty mark serializes as `{}`.
    let out = serde_yaml::to_string(&mark).expect("serialize");
    assert!(!out.contains("data"), "got: {out}");
    assert!(!out.contains("padding"), "got: {out}");
}

#[test]
fn a_marks_unknown_key_is_a_parse_error() {
    assert!(serde_yaml::from_str::<Item>("type: text\ntext: hi\nmark: { zzz: 1 }").is_err());
}

#[test]
fn a_checkbox_may_omit_its_box_entirely_for_auto_sizing() {
    let Item::Checkbox(c) = item("type: checkbox\ndata: { key: agree }") else {
        panic!("checkbox");
    };
    assert!(c.box_.is_none());
    // A present box with no w/h is also valid (placement without a size).
    let Item::Checkbox(c) = item("type: checkbox\nbox: { x: 4, y: 4 }\ndata: { key: agree }")
    else {
        panic!("checkbox");
    };
    let b = c.box_.expect("box");
    assert!(b.w.is_none() && b.h.is_none());
}
