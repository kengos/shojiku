//! Deprecated wire forms: each is reported as `deprecated_syntax` with or
//! without definitions, the current spellings report nothing, and every row
//! is removed in a later release the workspace has not reached yet.

use super::*;
use shojiku_diagnostics::{ArgValue, Severity};

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
fn the_margin_array_is_reported_with_and_without_definitions() {
    let template = with_margin("[20, 10, 20, 10]");
    for diags in [
        validate(None, &template, None),
        validate(Some(&defs()), &template, Some(&json!({}))),
    ] {
        let found = deprecations(&diags);
        assert_eq!(found.len(), 1, "{diags:?}");
        let diag = found[0];
        assert_eq!(diag.severity, Severity::Warning);
        assert_eq!(diag.path.as_deref(), Some("page.margin"));
        let expected = [
            ("form", "[top, right, bottom, left]"),
            ("key", "page.margin"),
            ("removed_in", "0.4.0"),
            ("replacement", "{ top, right, bottom, left }"),
            ("since", "0.3.0"),
        ]
        .map(|(k, v)| (k.to_owned(), ArgValue::from(v)));
        assert_eq!(diag.args, expected.into_iter().collect());
        assert_eq!(
            diag.message,
            "`page.margin` written as [top, right, bottom, left] is deprecated since 0.3.0 \
             and will be removed in 0.4.0; write { top, right, bottom, left } instead"
        );
    }
}

#[test]
fn the_current_margin_spellings_are_not_reported() {
    for margin in ["25", "{ top: 20, right: 10, bottom: 20, left: 10 }"] {
        let diags = validate(None, &with_margin(margin), None);
        assert!(deprecations(&diags).is_empty(), "{margin}: {diags:?}");
    }
    let unset =
        parse_template("sections:\n  body:\n    type: flow\n    items: []\n").expect("template");
    assert!(deprecations(&validate(None, &unset, None)).is_empty());
}

#[test]
fn every_deprecated_form_is_removed_in_a_later_release_not_yet_reached() {
    // A row must say when it goes; a removal at or before the deprecation
    // would be a table typo that no other test reads. And once the workspace
    // reaches that release the row must be gone, with its form refused.
    let current = env!("CARGO_PKG_VERSION");
    for form in crate::validate::deprecated::DEPRECATED_FORMS {
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
