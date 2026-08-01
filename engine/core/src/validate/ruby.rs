//! Structural checks for text-item `ruby` readings: empty entries, the
//! MAX_RUBY_ENTRIES cap, and the per-entry length cap. How the readings
//! are placed (beside a vertical column, above a horizontal run) is a
//! layout concern.

use crate::ruby::MAX_RUBY_LEN;
use crate::template::{Item, Template, TextItem, MAX_RUBY_ENTRIES};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::walk_sections;

/// Walks every text item and flags ruby-shape mistakes. All findings are
/// warnings: layout skips the offending entries and rendering proceeds.
pub(super) fn check_ruby(template: &Template, diags: &mut Diagnostics) {
    walk_sections(template, &mut |item, path| {
        if let Item::Text(text) = item {
            check_text_ruby(text, path, diags);
        }
    });
}

fn check_text_ruby(text: &TextItem, path: &str, diags: &mut Diagnostics) {
    if text.ruby.is_empty() {
        return;
    }
    if text.ruby.len() > MAX_RUBY_ENTRIES {
        diags.push(
            Diagnostic::new(Code::TooManyRubyEntries)
                .arg("count", text.ruby.len())
                .arg("max", MAX_RUBY_ENTRIES)
                .with_path(path.to_string()),
        );
    }
    for (ri, pair) in text.ruby.iter().take(MAX_RUBY_ENTRIES).enumerate() {
        if pair.base.is_empty() || pair.text.is_empty() {
            diags.push(
                Diagnostic::new(Code::EmptyRubyEntry).with_path(format!("{path}.ruby[{ri}]")),
            );
        } else if over_cap(&pair.base) || over_cap(&pair.text) {
            diags.push(
                Diagnostic::new(Code::RubyEntryTooLong)
                    .arg("max", MAX_RUBY_LEN as f64)
                    .with_path(format!("{path}.ruby[{ri}]")),
            );
        }
    }
}

/// Whether a base/reading exceeds the per-entry char cap — the base is a
/// search needle over params-driven content, so its length is bounded to
/// keep the layout-time scan linear in the content.
fn over_cap(s: &str) -> bool {
    s.chars().count() > MAX_RUBY_LEN
}
