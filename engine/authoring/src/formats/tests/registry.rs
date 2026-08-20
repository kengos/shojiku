//! The template's own `formats:` entries, including hostile ones.

use super::*;
use shojiku_diagnostics::MAX_ECHO;

// ── the registry ─────────────────────────────────────────────────────────

#[test]
fn a_registry_entry_is_offered_under_its_own_kind_only() {
    // `render_dated` looks a name up in the registry BEFORE the pack, so
    // offering a datetime entry under `date` would author a pick that
    // renders the wrong shape instead of warning.
    let template = template(
        "formats:\n  stamp: { type: date, pattern: \"yyyy.MM.dd\" }\n  \
         seen: { type: datetime, pattern: \"MM/dd HH:mm\" }\n",
    );
    let cat = catalog(&template);
    let names = |t: &str| -> Vec<String> {
        entry(&cat, t)
            .variants
            .iter()
            .filter(|v| v.origin == FormatOrigin::Registry)
            .map(|v| v.spelling.clone())
            .collect()
    };
    assert_eq!(names("date"), vec!["stamp".to_string()]);
    assert_eq!(names("datetime"), vec!["seen".to_string()]);
    assert_eq!(sample_for(&cat, "date", "stamp"), "2026.11.03");
}

#[test]
fn a_registry_name_is_bounded_and_control_stripped_in_the_response() {
    // The catalog is NOT a diagnostic, so it inherits no echo bound — and
    // nothing in the wire caps a name's LENGTH (`MAX_FORMATS` caps the
    // entry COUNT). A bidi override would reorder how the picker displays
    // every name beside it without changing a byte.
    let long = "n".repeat(MAX_ECHO + 50);
    let template = template(&format!(
        "formats:\n  \"{long}\": {{ type: date, pattern: d }}\n  \
         \"a\\u202Eb\": {{ type: date, pattern: d }}\n"
    ));
    let cat = catalog(&template);
    for v in &entry(&cat, "date").variants {
        assert!(v.spelling.chars().count() <= MAX_ECHO, "name unbounded");
        assert!(
            !v.spelling.contains('\u{202e}'),
            "bidi override survived into the response"
        );
    }
}

#[test]
fn a_name_that_would_not_survive_the_echo_guard_is_not_offered_at_all() {
    // A spelling here is not only DISPLAYED — a picker authors it back as
    // `format: <spelling>`. So offering a clipped or stripped form would
    // hand the author a pick that writes a key the registry does not hold:
    // the reference resolves to nothing and warns `unknown_format_variant`,
    // and the picker would be the thing that broke the document. Such an
    // entry is omitted from the CATALOG only; the registry surface reads
    // the document itself, so it stays visible and editable there.
    let long = "n".repeat(MAX_ECHO + 50);
    let template = template(&format!(
        "formats:\n  \"{long}\": {{ type: date, pattern: d }}\n  \
         \"a\\u202Eb\": {{ type: date, pattern: d }}\n  \
         ok: {{ type: date, pattern: d }}\n"
    ));
    let cat = catalog(&template);
    let offered: Vec<&str> = entry(&cat, "date")
        .variants
        .iter()
        .filter(|v| v.origin == FormatOrigin::Registry)
        .map(|v| v.spelling.as_str())
        .collect();
    assert_eq!(offered, vec!["ok"]);
}

#[test]
fn a_joiner_inside_a_name_survives_the_sanitize() {
    // The other side of the sanitize, and the one a blanket "strip every
    // format character" gets wrong: U+200C/200D CARRY MEANING in Indic,
    // Arabic and emoji text. Stripping them would silently rewrite an
    // author's name into a different string — and then the picker would
    // author a name the registry does not contain.
    let name = "\u{200d}zwj\u{200c}";
    let template = template(&format!(
        "formats:\n  \"{name}\": {{ type: date, pattern: d }}\n"
    ));
    let cat = catalog(&template);
    assert!(
        entry(&cat, "date")
            .variants
            .iter()
            .any(|v| v.spelling == name),
        "the joiners were stripped out of an author's own name"
    );
}

#[test]
fn a_registry_at_the_entry_cap_still_produces_a_catalog() {
    let mut src = String::from("formats:\n");
    for n in 0..shojiku_core::MAX_FORMATS {
        src.push_str(&format!("  f{n}: {{ type: date, pattern: d }}\n"));
    }
    let template = template(&src);
    let cat = catalog(&template);
    assert!(entry(&cat, "date").variants.len() > shojiku_core::MAX_FORMATS);
}

#[test]
fn no_document_still_yields_the_pack_and_builtin_vocabulary() {
    // A live editor's document is invalid for much of the time somebody is
    // typing in it. The catalog keeps working without one — it simply
    // carries no registry entries.
    let cat = format_catalog(None, &ja(), &[]);
    let date = cat
        .types
        .iter()
        .find(|t| t.field_type == "date")
        .expect("date present");
    assert!(!date.variants.is_empty());
    assert!(date
        .variants
        .iter()
        .all(|v| v.origin != FormatOrigin::Registry));
}
