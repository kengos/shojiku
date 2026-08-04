//! Unit tests for the inspect envelope: the borrowed view and the JSON
//! surface a Designer canvas gates on.

use super::*;
use crate::test_support::ok_prepared;

#[test]
fn envelope_carries_engine_document_boxes_and_margin() {
    let prepared = ok_prepared();
    let env = inspect_envelope(&prepared);
    assert_eq!(env.engine.version, env!("CARGO_PKG_VERSION"));
    assert_eq!(env.margin, prepared.margin);
    assert!(std::ptr::eq(env.document, &prepared.document));
}

#[test]
fn inspect_json_has_the_four_top_level_keys() {
    let prepared = ok_prepared();
    let json = inspect_json(&prepared).unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    for key in ["engine", "document", "boxes", "margin"] {
        assert!(value.get(key).is_some(), "missing key {key}");
    }
    let caps = value["engine"]["capabilities"].as_array().unwrap();
    assert!(caps.iter().any(|c| c == "text"));
    // Is advertised so a newer Designer gates the all-items overlay.
    assert!(caps.iter().any(|c| c == "inspect.boxes.all_items"));
}

#[test]
fn the_document_carries_its_resolved_metadata() {
    // The metadata rides the layout tree, so it reaches a Designer or an AI
    // consumer through `inspect` without a second surface. A document that
    // says nothing about itself still carries the default title, and the
    // unset fields do not serialize as nulls.
    let prepared = ok_prepared();
    let json = inspect_json(&prepared).unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    let meta = &value["document"]["metadata"];
    assert_eq!(meta["title"], "Shojiku Document");
    assert!(meta.get("description").is_none());
    assert!(meta.get("language").is_none());
    assert!(meta.get("keywords").is_none());
    assert!(meta.get("authors").is_none());
}

#[test]
fn boxes_carry_a_structural_path_for_id_less_items() {
    // SIMPLE's single text item has no `id:`; the index still emits its box,
    // addressed by the structural path alone (no `id` key serialized).
    let prepared = ok_prepared();
    let json = inspect_json(&prepared).unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    let boxes = &value["boxes"]["pages"][0];
    let first = &boxes[0];
    assert_eq!(first["path"], "sections.body.items[0]");
    assert!(first.get("id").is_none(), "id-less item omits the id key");
}
