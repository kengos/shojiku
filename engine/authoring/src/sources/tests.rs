//! Unit tests for source parsing/validation: the hard-error render path
//! (`load_sources`) and the diagnostic-surfacing GUI path (`validate_strings`).

use super::*;
use crate::test_support::SIMPLE;

const BAD_TEMPLATE: &str = "sections:\n  body:\n    type: bogus\n";

#[test]
fn load_sources_parses_and_validates_without_definitions() {
    let s = load_sources(None, SIMPLE, "{}").unwrap();
    assert!(!s.validation.has_errors());
    assert!(s.catalog.is_none());
}

#[test]
fn load_sources_builds_a_catalog_from_definitions() {
    let s = load_sources(Some("type: object\nproperties: {}\n"), SIMPLE, "{}").unwrap();
    assert!(s.catalog.is_some());
}

#[test]
fn load_sources_rejects_a_malformed_template() {
    assert!(load_sources(None, BAD_TEMPLATE, "{}").is_err());
}

#[test]
fn load_sources_rejects_malformed_definitions() {
    assert!(load_sources(Some("zzz: 1\n"), SIMPLE, "{}").is_err());
}

#[test]
fn load_sources_rejects_malformed_params() {
    assert!(load_sources(None, SIMPLE, "{ not json").is_err());
}

#[test]
fn validate_strings_reports_a_clean_template() {
    assert!(!validate_strings(None, SIMPLE, Some("{}")).has_errors());
}

#[test]
fn validate_strings_surfaces_a_template_parse_error_as_a_diagnostic() {
    let diags = validate_strings(None, BAD_TEMPLATE, None);
    assert!(diags.iter().any(|d| d.code == "parse_error"));
}

#[test]
fn validate_strings_surfaces_a_definitions_parse_error() {
    assert!(validate_strings(Some("zzz: 1\n"), SIMPLE, None).has_errors());
}

#[test]
fn validate_strings_surfaces_a_params_parse_error() {
    assert!(validate_strings(None, SIMPLE, Some("{ not json")).has_errors());
}

/// A template written with the `page.margin` array removed in 0.4.0.
const ARRAY_MARGIN: &str =
    "page:\n  margin: [20, 10, 20, 10]\nsections:\n  body:\n    type: flow\n    items: []\n";

#[test]
fn the_removed_margin_array_is_refused_on_both_the_render_and_the_validate_path() {
    // `load_sources` feeds render / preview / inspect on every host;
    // `validate_strings` is the GUI's and the CLI's `validate`. Both refuse
    // the array as a parse error that names the map to write instead.
    let hint = "write the per-side map `{ top, right, bottom, left }` instead";
    let rendered = load_sources(None, ARRAY_MARGIN, "{}")
        .err()
        .expect("the array is removed");
    assert!(rendered.to_string().contains(hint), "{rendered}");
    let validated = validate_strings(None, ARRAY_MARGIN, None);
    let codes: Vec<&str> = validated.iter().map(|d| d.code.as_str()).collect();
    assert_eq!(codes, ["parse_error"]);
    assert!(
        validated.iter().all(|d| d.message.contains(hint)),
        "{validated:?}"
    );
}
