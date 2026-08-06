//! Missing-glyph (tofu) diagnostics: the capped distinct-offender scan
//! shared by plain blocks and rich spans.

use crate::font::FontFace;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::super::Ctx;

/// Cap on distinct unmappable characters echoed in a `missing_glyph`
/// diagnostic. `content` is untrusted and unbounded, so the scan stops
/// here to bound both the work and the message length (mirrors the 32-char
/// hostile-string snippet cap in `core::length`).
const MAX_MISSING_GLYPHS: usize = 32;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Flags characters the resolved face cannot map: they would draw as
    /// the `.notdef` box (tofu) with no substitute (there is no font
    /// fallback chain). Reports the *distinct*
    /// offenders once per block so a rare name kanji repeated across many
    /// rows (e.g. `髙`, `﨑`) warns once, not once per occurrence. Control
    /// characters (newlines/tabs) are ignored — they legitimately have no
    /// glyph.
    ///
    /// `content` is attacker-controlled and unbounded (yaml_guard caps
    /// non-finite numbers, not string sizes), so the offender set is
    /// capped: the scan stops after [`MAX_MISSING_GLYPHS`] distinct
    /// characters, bounding both the O(n·cap) `contains` cost and the echo
    /// length in the diagnostic message.
    pub(in crate::engine::text) fn warn_missing_glyphs(
        &mut self,
        content: &str,
        chain: &[&FontFace],
        font_id: &str,
    ) {
        let mut missing = String::new();
        let truncated = collect_missing(content, chain, &mut missing);
        if !missing.is_empty() {
            let ellipsis = if truncated { " …" } else { "" };
            self.diags.push(
                Diagnostic::new(Code::MissingGlyph)
                    .arg("font", font_id)
                    .arg("chars", format!("{missing}{ellipsis}")),
            );
        }
    }
}

/// Appends `content`'s distinct unmappable characters (tofu: no chain
/// face maps them; controls skipped) to `missing`, stopping at
/// [`MAX_MISSING_GLYPHS`] — the shared budget bounds both the scan and
/// the diagnostic echo even across a rich block's many spans. Returns
/// whether the cap truncated the scan.
pub(in crate::engine) fn collect_missing(
    content: &str,
    chain: &[&FontFace],
    missing: &mut String,
) -> bool {
    for c in content.chars() {
        // A glyph is missing only when NO face in the fallback chain
        // maps it.
        if c.is_control() || missing.contains(c) || !crate::font::all_missing(chain, c) {
            continue;
        }
        if missing.chars().count() == MAX_MISSING_GLYPHS {
            return true;
        }
        missing.push(c);
    }
    false
}
