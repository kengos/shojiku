//! Reading the wire's own words out of the catalog.

use crate::reference::pages::catalog_vocabulary;
use serde_json::json;

#[test]
fn every_position_that_names_a_word_contributes_one() {
    let catalog = json!({
        "$defs": {
            "Style": {
                "properties": { "textAlign": { "enum": ["start", "vertical_rl"] } },
            },
            "Item": {
                "oneOf": [{ "properties": { "type": { "const": "qr_code" } } }],
            },
        },
    });
    let words = catalog_vocabulary(&catalog);
    for word in [
        "Style",
        "Item",
        "textAlign",
        "type",
        "start",
        "vertical_rl",
        "qr_code",
    ] {
        assert!(words.contains(word), "{word} is missing from {words:?}");
    }
    assert_eq!(words.len(), 7);
}

#[test]
fn a_non_string_enum_member_and_an_empty_document_contribute_nothing() {
    // A schema may enumerate numbers or booleans; those are values, not names.
    let words = catalog_vocabulary(&json!({ "enum": [1, true, null], "const": 2 }));
    assert!(words.is_empty(), "{words:?}");
    assert!(catalog_vocabulary(&json!(null)).is_empty());
    assert!(catalog_vocabulary(&json!([])).is_empty());
}

#[test]
fn a_properties_or_defs_value_that_is_not_an_object_is_skipped() {
    let words = catalog_vocabulary(&json!({ "properties": ["a"], "$defs": "b", "enum": "c" }));
    assert!(words.is_empty(), "{words:?}");
}

#[test]
fn the_committed_catalog_spells_the_wire_words_the_pages_quote() {
    // The positive control: a vocabulary built from the real artifact has to
    // hold words a reader can check, or the third lookup is decoration.
    let catalog: serde_json::Value =
        serde_json::from_str(crate::reference::CATALOG).expect("valid JSON");
    let words = catalog_vocabulary(&catalog);
    for word in ["vertical_rl", "space_between", "line_through", "qr_code"] {
        assert!(words.contains(word), "{word} is missing");
    }
}
