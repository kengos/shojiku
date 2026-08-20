//! The catalog and `validate` must agree about which picks are KNOWN.
//!
//! They are two homes for one fact. `validate/bindings.rs` decides whether a
//! `format:` on a binding is a known pick (its `known_elsewhere` arm); the
//! catalog decides what an editor may OFFER. A spelling the catalog offers
//! that validate warns about is a picker that produces a live diagnostic; a
//! spelling validate accepts that the catalog omits is a pick an editor
//! silently hides. Both are the documented two-homes failure, and neither is
//! visible from either side alone — so this drives the REAL validator.
//!
//! The fixtures declare a NARROW `displayFormats` list on purpose. Validate's
//! unknown-format check only fires when definitions declare one at all (an
//! empty list means "anything goes"), and `known_elsewhere` is precisely the
//! arm that lets a pick through DESPITE the narrow declaration. A fixture
//! declaring nothing would pass every assertion below vacuously.

use super::*;
use shojiku_core::{parse_definitions, validate};

const DEFS: &str = "\
type: object
properties:
  amount: { type: number, format: currency, displayFormats: [ { id: currency } ] }
  issued_on: { type: string, format: date, displayFormats: [ { id: default } ] }
";

/// Validate a document that binds `key` with `format: <spelling>`.
fn diagnose(key: &str, spelling: &str) -> Vec<String> {
    let src = format!(
        "sections:\n  body:\n    type: flow\n    items:\n      \
         - {{ type: text, text: \"{{{key}}}\", data: {{ key: {key}, format: {spelling} }} }}\n"
    );
    let template = parse_template(&src).expect("parse template");
    let defs = parse_definitions(DEFS).expect("parse definitions");
    validate(Some(&defs), &template, None)
        .iter()
        .map(|d| d.code.to_string())
        .collect()
}

#[test]
fn every_currency_spelling_the_catalog_offers_is_a_known_pick() {
    let cat = catalog(&empty_template());
    for v in &entry(&cat, "currency").variants {
        assert!(
            !diagnose("amount", &v.spelling).contains(&"unknown_format".to_string()),
            "the catalog offers `{}` for currency but validate calls it unknown",
            v.spelling
        );
    }
}

#[test]
fn a_spelling_validate_calls_unknown_is_not_in_the_catalog() {
    // The other direction, on the same field. `wareki` is a real DATE
    // variant; validate rejects it on a currency binding, so an editor that
    // offered it there would be offering a live error.
    assert!(diagnose("amount", "wareki").contains(&"unknown_format".to_string()));
    let cat = catalog(&empty_template());
    assert!(!entry(&cat, "currency")
        .variants
        .iter()
        .any(|v| v.spelling == "wareki"));
}

#[test]
fn a_registry_entry_is_a_known_pick_on_the_type_it_declares() {
    // The registry is the one vocabulary BOTH homes read from the document
    // rather than from a table, so it is where the two are most likely to
    // agree by accident rather than by construction.
    let src = "\
formats:
  stamp: { type: date, pattern: \"yyyy.MM.dd\" }
sections:
  body:
    type: flow
    items:
      - { type: text, text: \"{issued_on}\", data: { key: issued_on, format: stamp } }
";
    let template = parse_template(src).expect("parse template");
    let defs = parse_definitions(DEFS).expect("parse definitions");
    let codes: Vec<String> = validate(Some(&defs), &template, None)
        .iter()
        .map(|d| d.code.to_string())
        .collect();
    assert!(!codes.contains(&"unknown_format".to_string()));
    let cat = format_catalog(Some(&template), &ja(), &[]);
    assert!(entry(&cat, "date")
        .variants
        .iter()
        .any(|v| v.spelling == "stamp"));
}
