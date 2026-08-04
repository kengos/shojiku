//! `document:` metadata checks: the interpolation keys each metadata
//! string references, the charset scan that catches a `{品名}` mistake,
//! and the two list caps.
//!
//! Runs on every template, with or without definitions — the metadata
//! block is authored by hand more often than not, and a check gated on a
//! catalog would go silent exactly there.

use crate::interpolate::{parse_segments, scan_suspect_keys, Segment};
use crate::template::{DocumentMeta, Template, MAX_DOCUMENT_ENTRIES};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::bindings::{check_scalar_binding, BindingCtx};

/// Every authored metadata string with the document path it lives at.
/// List entries are addressed by index, so a diagnostic points at the
/// entry rather than at the whole list.
fn strings(meta: &DocumentMeta) -> Vec<(String, &str)> {
    let mut out: Vec<(String, &str)> = Vec::new();
    for (key, value) in [
        ("title", meta.title.as_deref()),
        ("description", meta.description.as_deref()),
        ("language", meta.language.as_deref()),
    ] {
        if let Some(value) = value {
            out.push((format!("document.{key}"), value));
        }
    }
    for (key, list) in [("keywords", &meta.keywords), ("authors", &meta.authors)] {
        for (i, value) in list.iter().take(MAX_DOCUMENT_ENTRIES).enumerate() {
            out.push((format!("document.{key}[{i}]"), value.as_str()));
        }
    }
    out
}

/// Checks the `document:` block: list caps, the suspect-key charset scan,
/// and every interpolated key against the catalog/params.
pub(super) fn check_document(template: &Template, ctx: &BindingCtx, diags: &mut Diagnostics) {
    let meta = &template.document;
    for (key, list) in [("keywords", &meta.keywords), ("authors", &meta.authors)] {
        if list.len() > MAX_DOCUMENT_ENTRIES {
            diags.push(
                Diagnostic::new(Code::TooManyDocumentEntries)
                    .arg("key", key)
                    .arg("count", list.len())
                    .arg("max", MAX_DOCUMENT_ENTRIES)
                    .with_path(format!("document.{key}")),
            );
        }
    }
    for (path, text) in strings(meta) {
        for suspect in scan_suspect_keys(text) {
            diags.push(
                Diagnostic::new(Code::InterpolationKeyCharset)
                    .arg("text", format!("{{{suspect}}}"))
                    .with_path(path.clone()),
            );
        }
        for segment in parse_segments(text) {
            if let Segment::Expr { key, format } = segment {
                check_scalar_binding(ctx, &key, format.as_deref(), None, &path, diags);
            }
        }
    }
}
