//! The cascade against `shojiku_core::facts`: a key inherits through
//! `ComputedStyle::base` exactly when the inheritance row says so, and
//! overlaying a key's initial value leaves the engine default unchanged.

use super::super::ComputedStyle;
use shojiku_core::facts::{self, Initial};
use shojiku_core::{Style, StyleKey};

/// One value per key that differs from its initial value.
const NOT_INITIAL: [(&str, &str); 24] = [
    ("fontSize", "12"),
    ("fontFamily", "Serif"),
    ("lineHeight", "1.5"),
    ("color", "'#112233'"),
    ("textAlign", "center"),
    ("verticalAlign", "middle"),
    ("lineBreak", "strict"),
    ("textSpacingTrim", "trim_start"),
    ("hangingPunctuation", "allow_end"),
    ("backgroundColor", "'#ffffff'"),
    ("borderWidth", "1"),
    ("borderColor", "'#112233'"),
    ("borderStyle", "dashed"),
    ("borderRadius", "2"),
    ("textOverflow", "ellipsis"),
    ("fontWeight", "bold"),
    ("fontStyle", "italic"),
    ("letterSpacing", "1"),
    ("overflow", "hidden"),
    ("textDecoration", "underline"),
    ("opacity", "0.5"),
    ("writingMode", "vertical_rl"),
    ("textOrientation", "upright"),
    ("textCombineUpright", "all"),
];

fn style(yaml: &str) -> Style {
    shojiku_core::yaml::from_str(yaml).unwrap_or_else(|e| panic!("{yaml}: {e}"))
}

#[test]
fn a_key_inherits_through_base_exactly_when_the_row_says_so() {
    let names: Vec<&str> = NOT_INITIAL.iter().map(|(k, _)| *k).collect();
    let keys: Vec<&str> = StyleKey::ALL.iter().map(|k| k.as_str()).collect();
    assert_eq!(names, keys, "one sample per key, in key order");
    for (key, (name, value)) in StyleKey::ALL.into_iter().zip(NOT_INITIAL) {
        let parent = ComputedStyle::default().overlaid(&style(&format!("{{ {name}: {value} }}")));
        assert_ne!(
            parent,
            ComputedStyle::default(),
            "`{name}: {value}` changed nothing"
        );
        let child = ComputedStyle::base(&parent);
        assert_eq!(
            child != ComputedStyle::default(),
            facts::inherits(key),
            "`{name}` reaches the child: {}",
            child != ComputedStyle::default()
        );
    }
}

/// Overlaying the initial value is a no-op. `color` and `borderColor` are
/// the exception in FORM only: the cascade holds them unset and the guard
/// draws unset as black, which is the initial value the row states.
#[test]
fn overlaying_the_initial_value_changes_nothing() {
    let mut checked = 0;
    for key in StyleKey::ALL {
        let Some(value) = facts::initial(key) else {
            continue;
        };
        if matches!(key, StyleKey::Color | StyleKey::BorderColor) {
            assert_eq!(value, Initial::Keyword("#000000"));
            continue;
        }
        let yaml = format!("{{ {}: {} }}", key.as_str(), value.to_json());
        let overlaid = ComputedStyle::default().overlaid(&style(&yaml));
        assert_eq!(overlaid, ComputedStyle::default(), "{yaml}");
        checked += 1;
    }
    assert_eq!(checked, 19);
    let unset = ComputedStyle::default();
    assert!(unset.color.is_none() && unset.border_colors.iter().all(Option::is_none));
}
