//! Unit tests for the `formats:` registry checks (reserved names, size cap).

use crate::template::parse_template;
use crate::validate::validate;

#[test]
fn oversized_registry_warns() {
    let entries: String = (0..257)
        .map(|i| format!("  f{i}: {{ type: date, pattern: \"M/d\" }}\n"))
        .collect();
    let template = parse_template(&format!(
        "formats:\n{entries}sections:\n  body: {{ type: absolute }}\n"
    ))
    .expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "too_many_formats"));
}

#[test]
fn reserved_registry_name_is_an_error() {
    let template = parse_template(
        "formats:\n  currency: { type: date, pattern: \"M/d\" }\nsections:\n  body: { type: absolute }\n",
    )
    .expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "reserved_format_name"));
}

#[test]
fn inline_pattern_on_non_dated_default_warns() {
    let template = parse_template(
        "defaults:\n  formats:\n    currency: { pattern: \"M/d\" }\nsections:\n  body: { type: absolute }\n",
    )
    .expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "format_pattern_ignored"));
}

#[test]
fn named_format_and_dated_inline_default_are_clean() {
    let template = parse_template(
        "defaults:\n  formats:\n    date: { pattern: \"yyyy-MM-dd\" }\n    currency: symbol\nformats:\n  short-date: { type: date, pattern: \"M/d\" }\nsections:\n  body: { type: absolute }\n",
    )
    .expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
}
