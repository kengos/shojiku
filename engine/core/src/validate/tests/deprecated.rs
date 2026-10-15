//! Deprecated wire forms: a table row is reported as `deprecated_syntax`,
//! with or without definitions, only for a template that uses its form; the
//! real table reports nothing today; and every row is removed in a later
//! release the workspace has not reached yet. The real table is empty
//! between deprecations, so the pass is driven through a probe row.

use super::*;
use crate::validate::deprecated::{DeprecatedForm, DEPRECATED_FORMS};
use crate::validate::validate_with;
use crate::Length;
use shojiku_diagnostics::{ArgValue, Deprecation, Severity};

/// A row whose detector fires on a zero top margin.
const PROBE: DeprecatedForm = DeprecatedForm {
    key: "page.margin",
    form: "0",
    replacement: "{ top: 0 }",
    window: Deprecation {
        since: "0.3.0",
        removed_in: "99.0.0",
    },
    used_by: |template| template.page.margin.edges()[0] == Length::Pt(0.0),
};

fn with_margin(margin: &str) -> Template {
    parse_template(&format!(
        "page:\n  margin: {margin}\nsections:\n  body:\n    type: flow\n    items: []\n"
    ))
    .expect("template")
}

fn deprecations(diags: &Diagnostics) -> Vec<&Diagnostic> {
    diags
        .iter()
        .filter(|d| d.code == "deprecated_syntax")
        .collect()
}

#[test]
fn a_row_is_reported_with_and_without_definitions() {
    let template = with_margin("0");
    for diags in [
        validate_with(&[PROBE], None, &template, None),
        validate_with(&[PROBE], Some(&defs()), &template, Some(&json!({}))),
    ] {
        assert_reported(&diags);
    }
}

fn assert_reported(diags: &Diagnostics) {
    let found = deprecations(diags);
    assert_eq!(found.len(), 1, "{diags:?}");
    let diag = found[0];
    assert_eq!(diag.severity, Severity::Warning);
    assert_eq!(diag.path.as_deref(), Some("page.margin"));
    let expected = [
        ("form", "0"),
        ("key", "page.margin"),
        ("removed_in", "99.0.0"),
        ("replacement", "{ top: 0 }"),
        ("since", "0.3.0"),
    ]
    .map(|(k, v)| (k.to_owned(), ArgValue::from(v)));
    assert_eq!(diag.args, expected.into_iter().collect());
    assert_eq!(
        diag.message,
        "`page.margin` written as 0 is deprecated since 0.3.0 \
         and will be removed in 99.0.0; write { top: 0 } instead"
    );
}

#[test]
fn a_row_is_not_reported_for_a_template_that_does_not_use_its_form() {
    let diags = validate_with(&[PROBE], None, &with_margin("25"), None);
    assert!(deprecations(&diags).is_empty(), "{diags:?}");
}

#[test]
fn the_current_table_reports_nothing_with_or_without_definitions() {
    for margin in ["0", "25", "{ top: 20, right: 10, bottom: 20, left: 10 }"] {
        let template = with_margin(margin);
        for diags in [
            validate(None, &template, None),
            validate(Some(&defs()), &template, Some(&json!({}))),
        ] {
            assert!(deprecations(&diags).is_empty(), "{margin}: {diags:?}");
        }
    }
}

/// A row must say when it goes; a removal at or before the deprecation
/// would be a table typo that no other test reads. And once the workspace
/// reaches that release the row must be gone, with its form refused.
fn assert_windows_open(forms: &[DeprecatedForm]) {
    let current = env!("CARGO_PKG_VERSION");
    for form in forms {
        let window = form.window;
        assert!(window.is_release(), "{}", form.key);
        assert!(!window.is_due_at(window.since), "{}", form.key);
        assert!(
            !window.is_due_at(current),
            "`{}` is marked for removal in {} and the workspace is at {current}; remove it",
            form.key,
            window.removed_in
        );
    }
}

#[test]
fn every_deprecated_form_is_removed_in_a_later_release_not_yet_reached() {
    assert_windows_open(DEPRECATED_FORMS);
    assert_windows_open(&[PROBE]);
}
