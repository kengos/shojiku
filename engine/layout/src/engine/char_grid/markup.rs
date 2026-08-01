//! `char_grid` content → ruby segments: the opt-in `markup: aozora`
//! parse and the diagnostics its warnings become. Without the opt-in
//! every string stays ONE verbatim segment, markup characters included —
//! bound user data is never interpreted by default.

use shojiku_core::{parse_aozora_ruby, Markup, RubySegment, RubyWarning};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

/// The segments `content` parses into under `markup`, with whatever the
/// parse reported. Pure: the caller owns diagnostic delivery.
pub(super) fn segments(
    content: String,
    markup: Option<Markup>,
) -> (Vec<RubySegment>, Vec<Diagnostic>) {
    match markup {
        Some(Markup::Aozora) => {
            let (segments, warnings) = parse_aozora_ruby(&content);
            let diags = warnings.into_iter().map(markup_diagnostic).collect();
            (segments, diags)
        }
        None => (
            vec![RubySegment {
                text: content,
                ruby: None,
                sheet_break: false,
                scale: None,
                placement: None,
            }],
            Vec::new(),
        ),
    }
}

/// The diagnostic one markup warning becomes: an unsupported `［＃…］`
/// note names itself (the scan capped its body), every other mistake
/// carries the parser's static description.
fn markup_diagnostic(warning: RubyWarning) -> Diagnostic {
    match warning {
        RubyWarning::NoteIgnored(note) => {
            Diagnostic::new(Code::AozoraNoteIgnored).arg("note", note)
        }
        other => Diagnostic::new(Code::RubyMarkupInvalid).arg("detail", other.message()),
    }
}
