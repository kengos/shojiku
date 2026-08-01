//! Unit tests for the `textCombineUpright: all` keyword and the
//! [`TextCombine`] active-mode type (the layout/tree carrier) — split
//! from [`super::writing_tests`] for the line budget.

use super::writing::{TextCombine, TextCombineUpright};
use super::Style;

#[test]
fn text_combine_upright_parses_and_round_trips_the_all_keyword() {
    let s: Style = serde_yaml::from_str("textCombineUpright: all\n").expect("parse");
    assert_eq!(s.text_combine_upright, Some(TextCombineUpright::All));
    let yaml = serde_yaml::to_string(&s).expect("yaml");
    assert!(yaml.contains("textCombineUpright: all"), "got: {yaml}");
}

#[test]
fn text_combine_upright_parses_the_all_keyword_from_json() {
    // The JSON deserializer's string path, like the `none` keyword test.
    let s: Style = serde_json::from_str(r#"{"textCombineUpright":"all"}"#).expect("parse");
    assert_eq!(s.text_combine_upright, Some(TextCombineUpright::All));
}

#[test]
fn active_maps_each_variant() {
    assert_eq!(TextCombineUpright::None.active(), None);
    assert_eq!(
        TextCombineUpright::Digits(3).active(),
        Some(TextCombine::Digits(3))
    );
    assert_eq!(TextCombineUpright::All.active(), Some(TextCombine::All));
}

#[test]
fn digits_is_the_char_grid_arm_and_ignores_all() {
    assert_eq!(TextCombineUpright::None.digits(), None);
    assert_eq!(TextCombineUpright::Digits(2).digits(), Some(2));
    // char_grid combines digit runs only; `all` does not apply there.
    assert_eq!(TextCombineUpright::All.digits(), None);
}

#[test]
fn text_combine_serde_round_trips_both_forms() {
    let all = serde_json::to_value(TextCombine::All).expect("json");
    assert_eq!(all, serde_json::json!("all"));
    let digits = serde_json::to_value(TextCombine::Digits(3)).expect("json");
    assert_eq!(digits, serde_json::json!({ "digits": 3 }));
    let back: TextCombine = serde_json::from_value(all).expect("parse");
    assert_eq!(back, TextCombine::All);
    let back: TextCombine = serde_json::from_value(digits).expect("parse");
    assert_eq!(back, TextCombine::Digits(3));
}
