//! Structural checks for rich-text `spans` (RT1): content exclusivity,
//! the MAX_SPANS cap, and span-inapplicable style keys.

use crate::template::{Item, Template, TextItem, MAX_SPANS};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::walk_sections;

/// Walks every text item and flags span-shape mistakes. All findings are
/// warnings: layout resolves each deterministically (spans win over
/// `text`/`data`, `data` wins inside a span, extra spans are dropped,
/// inert style keys are ignored), so rendering still proceeds.
pub(super) fn check_spans(template: &Template, diags: &mut Diagnostics) {
    walk_sections(template, &mut |item, path| {
        if let Item::Text(text) = item {
            check_text_spans(text, path, diags);
        }
    });
}

fn check_text_spans(text: &TextItem, path: &str, diags: &mut Diagnostics) {
    if text.spans.is_empty() {
        return;
    }
    if text.text.is_some() || text.data.is_some() {
        diags.push(
            Diagnostic::new(Code::SpanContentConflict)
                .arg("winner", "spans")
                .with_path(path.to_string()),
        );
    }
    if text.spans.len() > MAX_SPANS {
        diags.push(
            Diagnostic::new(Code::TooManySpans)
                .arg("count", text.spans.len())
                .arg("max", MAX_SPANS)
                .with_path(path.to_string()),
        );
    }
    for (si, span) in text.spans.iter().take(MAX_SPANS).enumerate() {
        let span_path = format!("{path}.spans[{si}]");
        match (&span.text, &span.data) {
            (Some(_), Some(_)) => diags.push(
                Diagnostic::new(Code::SpanContentConflict)
                    .arg("winner", "data")
                    .with_path(span_path.clone()),
            ),
            (None, None) => {
                diags.push(Diagnostic::new(Code::EmptySpan).with_path(span_path.clone()))
            }
            _ => {}
        }
        // Only the author's inline style is flagged: a named style is a
        // shared bag that may legitimately carry block-level keys for its
        // other users.
        let ignored = span.style.ignored_span_keys();
        if !ignored.is_empty() {
            diags.push(
                Diagnostic::new(Code::IgnoredSpanStyle)
                    .arg("keys", ignored.join(", "))
                    .with_path(span_path),
            );
        }
    }
}
