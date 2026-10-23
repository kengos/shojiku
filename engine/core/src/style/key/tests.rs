//! [`StyleKey`]: the key set is exactly the set of fields a [`Style`]
//! writes, and `is_set` reads the field each key names.

use super::{Style, StyleKey};
use std::collections::BTreeSet;

/// One accepted value per key, as flow YAML.
const ONE_VALUE_EACH: [(&str, &str); 24] = [
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
    ("borderColor", "'#000000'"),
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

fn one_key(name: &str, value: &str) -> Style {
    crate::yaml::from_str(&format!("{{ {name}: {value} }}"))
        .unwrap_or_else(|e| panic!("`{name}: {value}`: {e}"))
}

#[test]
fn the_key_set_is_the_field_set_the_wire_writes() {
    let mut full = Style::default();
    for (name, value) in ONE_VALUE_EACH {
        let one = one_key(name, value);
        let written = serde_json::to_value(&one).expect("a style serializes");
        let object = written.as_object().expect("a style is a map");
        assert_eq!(object.len(), 1, "`{name}` wrote {object:?}");
        assert!(object.contains_key(name));
        full = merge(full, one);
    }
    let written = serde_json::to_value(&full).expect("a style serializes");
    let fields: BTreeSet<&str> = written
        .as_object()
        .expect("a style is a map")
        .keys()
        .map(String::as_str)
        .collect();
    let keys: BTreeSet<&str> = StyleKey::ALL.iter().map(|k| k.as_str()).collect();
    assert_eq!(fields, keys);
    assert_eq!(keys.len(), StyleKey::ALL.len(), "two keys share a name");
}

#[test]
fn is_set_reads_the_field_each_key_names() {
    for (name, value) in ONE_VALUE_EACH {
        let one = one_key(name, value);
        for key in StyleKey::ALL {
            assert_eq!(
                one.is_set(key),
                key.as_str() == name,
                "a style authoring only `{name}` answers {key:?}"
            );
        }
    }
}

#[test]
fn all_is_in_field_order() {
    let names: Vec<&str> = StyleKey::ALL.iter().map(|k| k.as_str()).collect();
    let listed: Vec<&str> = ONE_VALUE_EACH.iter().map(|(name, _)| *name).collect();
    assert_eq!(names, listed);
}

/// Every field `b` authors, laid over `a`.
fn merge(a: Style, b: Style) -> Style {
    let mut a = serde_json::to_value(a).expect("a style serializes");
    let b = serde_json::to_value(b).expect("a style serializes");
    for (k, v) in b.as_object().expect("a map") {
        a[k] = v.clone();
    }
    serde_json::from_value(a).expect("a merged style parses")
}
