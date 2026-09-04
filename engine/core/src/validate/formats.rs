//! Presentation-defaults checks: the `formats:` registry (reserved names, size cap) and
//! `defaults.formats` (inline patterns only make sense on date/datetime).

use crate::definitions::FieldType;
use crate::template::{FormatRef, Template, MAX_FORMATS};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics, Echo};

pub(super) fn check_formats(template: &Template, diags: &mut Diagnostics) {
    if template.formats.len() > MAX_FORMATS {
        diags.push(
            Diagnostic::new(Code::TooManyFormats)
                .arg("count", template.formats.len())
                .arg("max", MAX_FORMATS),
        );
    }
    for name in template.formats.keys() {
        // Type names are reserved: `format: currency` is a type override
        // (format dispatch), so a registry entry by that name would be
        // unreachable. That is no longer true on a DATE/DATETIME field —
        // there a declared name beats the override, registry entries
        // included (`formatter`'s `dated::declares`) — so the refusal is now
        // conservative rather than forced. It stands because the name would
        // still be unreachable on every other type, and an entry that works
        // on two types while silently re-typing the value on the rest is
        // worse than one refused outright.
        if FieldType::from_name(name).is_some() {
            diags.push(
                Diagnostic::new(Code::ReservedFormatName)
                    .arg("name", name)
                    .with_path(format!("formats.{}", Echo::inline(name))),
            );
        }
    }
    let Some(defaults) = &template.defaults.formats else {
        return;
    };
    // Inline patterns only exist for the dated types; on the others the
    // engine falls back to the default form at render, so say so early.
    for (key, slot) in [
        ("number", &defaults.number),
        ("currency", &defaults.currency),
        ("percentage", &defaults.percentage),
        ("quantity", &defaults.quantity),
    ] {
        if matches!(slot, Some(FormatRef::Inline(_))) {
            diags.push(
                Diagnostic::new(Code::FormatPatternIgnored)
                    .arg("key", format!("defaults.formats.{}", Echo::inline(key)))
                    .with_path(format!("defaults.formats.{}", Echo::inline(key))),
            );
        }
    }
}

#[cfg(test)]
mod tests;
