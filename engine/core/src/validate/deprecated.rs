//! Wire forms that still parse and render but are marked for removal, each
//! reported as `deprecated_syntax` so an author sees it a release before the
//! form stops parsing.
//!
//! ONE table drives every such form: a new deprecation is a row here plus a
//! detector over the parsed model, never a new diagnostic code. The rule for
//! when a form may be deprecated and removed is `docs/architecture.md`
//! § Deprecation. When a form is removed, its row goes with it; the table and
//! the code stay as the standing mechanism, empty or not. A row still listed
//! once the workspace reaches its `removed_in` fails a test, so the removal
//! happens in the release that announced it.
//!
//! Runs on every template, with or without definitions: a deprecated form is
//! a fact about the document's own spelling.

use crate::template::Template;
use shojiku_diagnostics::{Deprecation, Diagnostic, DiagnosticCode as Code, Diagnostics};

/// One deprecated wire form and how to recognise it.
pub(super) struct DeprecatedForm {
    /// The dotted wire key, which is also the diagnostic's `path`.
    pub(super) key: &'static str,
    /// The deprecated spelling, as YAML.
    pub(super) form: &'static str,
    /// The spelling to write instead, as YAML.
    pub(super) replacement: &'static str,
    /// The release that deprecated it and the one that stops parsing it.
    pub(super) window: Deprecation,
    /// Whether the parsed template was written in this form.
    pub(super) used_by: fn(&Template) -> bool,
}

/// Every deprecated form the parser still accepts. Each arg is a YAML
/// literal or a version, so no English reaches a translated message.
pub(super) const DEPRECATED_FORMS: &[DeprecatedForm] = &[DeprecatedForm {
    key: "page.margin",
    form: "[top, right, bottom, left]",
    replacement: "{ top, right, bottom, left }",
    window: Deprecation {
        since: "0.3.0",
        removed_in: "0.4.0",
    },
    used_by: |template| template.page.margin.is_legacy_array(),
}];

/// Reports each deprecated form `template` uses, in table order.
pub(super) fn check_deprecated(template: &Template, diags: &mut Diagnostics) {
    for form in DEPRECATED_FORMS.iter().filter(|f| (f.used_by)(template)) {
        diags.push(
            Diagnostic::new(Code::DeprecatedSyntax)
                .arg("key", form.key)
                .arg("form", form.form)
                .arg("replacement", form.replacement)
                .arg("since", form.window.since)
                .arg("removed_in", form.window.removed_in)
                .with_path(form.key),
        );
    }
}
