//! Validation of the `document:` metadata block: interpolation keys,
//! the charset scan, and the two list caps.

use super::*;
use crate::template::MAX_DOCUMENT_ENTRIES;

/// A template carrying only a `document:` block and an empty body.
fn doc_tpl(block: &str) -> Template {
    parse_template(&format!(
        "document:\n{block}sections:\n  body:\n    type: flow\n    items: []\n"
    ))
    .expect("template")
}

#[test]
fn metadata_keys_are_checked_against_definitions() {
    let template = doc_tpl("  title: \"{order.code} / {nope}\"\n");
    let diags = validate(Some(&defs()), &template, None);
    let unknown: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .collect();
    assert_eq!(unknown.len(), 1, "{diags:?}");
    assert_eq!(unknown[0].path.as_deref(), Some("document.title"));
}

#[test]
fn metadata_keys_are_checked_against_params_without_definitions() {
    // The hand-authored case: no definitions at all, so a check gated on a
    // catalog would go silent exactly where authors need it.
    let template = doc_tpl(concat!(
        "  description: \"{missing}\"\n",
        "  keywords: [\"{customer.name}\"]\n",
        "  authors: [\"{issuer}\"]\n",
        "  language: \"{lang}\"\n",
    ));
    let diags = validate(
        None,
        &template,
        Some(&json!({ "customer": { "name": "A" } })),
    );
    let missing: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "missing_data")
        .map(|d| d.path.clone().unwrap_or_default())
        .collect();
    // The walk's order: the scalars in authored order, then the lists.
    assert_eq!(
        missing,
        [
            "document.description",
            "document.language",
            "document.authors[0]"
        ],
        "{diags:?}"
    );
}

#[test]
fn a_non_ascii_interpolation_name_is_surfaced() {
    // `{品名}` cannot parse as an interpolation name; the suspect scan is
    // what tells the author, and it must reach the metadata block too.
    let template = doc_tpl("  title: \"{品名}のご請求\"\n");
    let diags = validate(None, &template, None);
    let charset: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "interpolation_key_charset")
        .collect();
    assert_eq!(charset.len(), 1, "{diags:?}");
    assert_eq!(charset[0].path.as_deref(), Some("document.title"));
}

#[test]
fn over_cap_lists_warn_per_list() {
    let entries = |n: usize| -> String {
        (0..n)
            .map(|i| format!("    - k{i}\n"))
            .collect::<Vec<_>>()
            .join("")
    };
    let template = doc_tpl(&format!(
        "  keywords:\n{}  authors:\n{}",
        entries(MAX_DOCUMENT_ENTRIES + 1),
        entries(MAX_DOCUMENT_ENTRIES + 2)
    ));
    let diags = validate(None, &template, None);
    let capped: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "too_many_document_entries")
        .collect();
    assert_eq!(capped.len(), 2, "{diags:?}");
    assert_eq!(capped[0].path.as_deref(), Some("document.keywords"));
    assert_eq!(capped[1].path.as_deref(), Some("document.authors"));
    assert!(!diags.has_errors());
}

#[test]
fn a_template_without_metadata_says_nothing() {
    let template = doc_tpl("");
    assert!(validate(None, &template, Some(&json!({}))).is_empty());
}
