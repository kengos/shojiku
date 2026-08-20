//! `shojiku formats` — probe-spec parsing, the optional template, and what
//! the command actually prints.

use super::*;
use std::io::Write;

fn args() -> FormatsArgs {
    FormatsArgs {
        templates: None,
        lang: Some("ja-JP".to_string()),
        locale_dir: vec![],
        probe: vec![],
    }
}

fn write_temp(name: &str, body: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("shojiku-formats-{}-{name}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let path = dir.join("templates.yml");
    let mut file = std::fs::File::create(&path).expect("create");
    file.write_all(body.as_bytes()).expect("write");
    path
}

#[test]
fn a_probe_splits_at_the_first_colon_only() {
    // A pattern routinely contains one, so splitting on every colon would
    // make the commonest time pattern unspellable.
    let probe = parse_probe("datetime:HH:mm").expect("parsed");
    assert_eq!(probe.field_type, FieldType::Datetime);
    assert_eq!(probe.pattern, "HH:mm");
}

#[test]
fn a_probe_with_no_colon_is_a_usage_error() {
    let err = parse_probe("yyyy").expect_err("no type");
    assert!(matches!(err.class(), crate::error::FailureClass::Usage));
}

#[test]
fn a_probe_type_with_no_pattern_form_is_refused() {
    // `currency` is a real field type and has no pattern form at all.
    assert!(parse_probe("currency:foo").is_err());
    assert!(parse_probe("nonsense:foo").is_err());
}

#[test]
fn the_catalog_prints_without_any_template() {
    let out = run_formats(&args()).expect("catalog");
    let value: serde_json::Value = serde_json::from_str(&out).expect("json");
    let types = value["types"].as_array().expect("types");
    assert_eq!(types.len(), 6);
    assert!(types
        .iter()
        .any(|t| t["fieldType"] == "date" && !t["variants"].as_array().unwrap().is_empty()));
}

#[test]
fn a_template_contributes_its_registry_entries() {
    let path = write_temp(
        "registry",
        "formats:\n  stamp: { type: date, pattern: \"yyyy.MM.dd\" }\n\
         sections:\n  body:\n    type: flow\n    items: []\n",
    );
    let out = run_formats(&FormatsArgs {
        templates: Some(path),
        ..args()
    })
    .expect("catalog");
    assert!(out.contains("\"stamp\""));
    assert!(out.contains("2026.11.03"), "with its rendered sample");
    assert!(out.contains("\"registry\""), "and its origin");
}

#[test]
fn a_named_template_that_cannot_be_read_is_an_error() {
    // Distinct from passing NO template: the caller named this file.
    let err = run_formats(&FormatsArgs {
        templates: Some(std::path::PathBuf::from("/nonexistent/templates.yml")),
        ..args()
    })
    .expect_err("missing file");
    assert!(matches!(err, CliError::Io { .. }));
}

#[test]
fn a_probe_is_answered_in_the_printed_catalog() {
    let out = run_formats(&FormatsArgs {
        probe: vec!["date:yyyy/MM/dd".to_string()],
        ..args()
    })
    .expect("catalog");
    assert!(out.contains("2026/11/03"));
}

#[test]
fn the_template_locale_is_used_when_no_lang_is_given() {
    let path = write_temp(
        "locale",
        "defaults: { locale: en-US }\n\
         sections:\n  body:\n    type: flow\n    items: []\n",
    );
    let out = run_formats(&FormatsArgs {
        templates: Some(path),
        lang: None,
        ..args()
    })
    .expect("catalog");
    // en-US spells its months out; ja-JP would not produce "November".
    assert!(out.contains("Nov"), "the template's own locale was used");
}
