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
