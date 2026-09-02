//! That the hand-written severity words are the ones serde emits.

use super::{registry, word};
use shojiku_diagnostics::{DiagnosticCode, Severity};

/// The match in [`super`] is the only place the words are spelled. If it ever
/// disagrees with serde, a rendered `Severity` cell stops matching the word a
/// real diagnostic carries — which is the whole reason the column is derived.
#[test]
fn every_severity_word_is_what_serde_emits() {
    for severity in [Severity::Error, Severity::Warning, Severity::Info] {
        let serialized = serde_json::to_value(severity).expect("Severity serializes");
        assert_eq!(
            serialized.as_str(),
            Some(word(severity)),
            "the hand-written word for {severity:?} is not what serde emits",
        );
    }
}

/// A count alone would pass over a map whose values are all empty, which is
/// exactly what a blank `Severity` column looks like — so the values get a
/// positive control of their own.
#[test]
fn the_registry_holds_every_code_with_a_severity() {
    let map = registry();
    assert_eq!(map.len(), DiagnosticCode::ALL.len());
    assert_eq!(
        map.get("unknown_font_family").map(String::as_str),
        Some("warning")
    );
    assert!(map.values().all(|word| !word.is_empty()));
}
