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
mod tests {
    use crate::template::parse_template;
    use crate::validate::validate;

    #[test]
    fn oversized_registry_warns() {
        let entries: String = (0..257)
            .map(|i| format!("  f{i}: {{ type: date, pattern: \"M/d\" }}\n"))
            .collect();
        let template = parse_template(&format!(
            "formats:\n{entries}sections:\n  body: {{ type: absolute }}\n"
        ))
        .expect("template");
        let diags = validate(None, &template, None);
        assert!(diags.iter().any(|d| d.code == "too_many_formats"));
    }

    #[test]
    fn reserved_registry_name_is_an_error() {
        let template = parse_template(
            "formats:\n  currency: { type: date, pattern: \"M/d\" }\nsections:\n  body: { type: absolute }\n",
        )
        .expect("template");
        let diags = validate(None, &template, None);
        assert!(diags.iter().any(|d| d.code == "reserved_format_name"));
    }

    #[test]
    fn inline_pattern_on_non_dated_default_warns() {
        let template = parse_template(
            "defaults:\n  formats:\n    currency: { pattern: \"M/d\" }\nsections:\n  body: { type: absolute }\n",
        )
        .expect("template");
        let diags = validate(None, &template, None);
        assert!(diags.iter().any(|d| d.code == "format_pattern_ignored"));
    }

    #[test]
    fn named_format_and_dated_inline_default_are_clean() {
        let template = parse_template(
            "defaults:\n  formats:\n    date: { pattern: \"yyyy-MM-dd\" }\n    currency: symbol\nformats:\n  short-date: { type: date, pattern: \"M/d\" }\nsections:\n  body: { type: absolute }\n",
        )
        .expect("template");
        let diags = validate(None, &template, None);
        assert!(diags.is_empty(), "diagnostics: {diags:?}");
    }
}
