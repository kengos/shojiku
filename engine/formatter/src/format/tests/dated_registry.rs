//! The `formats:` REGISTRY half of the dated-pick precedence.
//!
//! Split from `dated_pick.rs` for the line budget. The registry is consulted
//! on the same footing as the pack — it is the one shape where the AUTHOR,
//! not the pack vendor, can close the shadow — and it must still win over the
//! pack for the same name, and still stay out of a non-dated field's way.

use super::*;
use shojiku_core::{NamedFormat, NamedFormatKind};
use std::collections::BTreeMap;

const NOON: &str = "2026-11-03T14:05:00+09:00";

fn registry(entries: &[(&str, NamedFormatKind, &str)]) -> BTreeMap<String, NamedFormat> {
    entries
        .iter()
        .map(|(name, kind, pattern)| {
            (
                (*name).to_string(),
                NamedFormat {
                    kind: *kind,
                    pattern: (*pattern).to_string(),
                },
            )
        })
        .collect()
}

fn with_registry<'a>(named: &'a BTreeMap<String, NamedFormat>) -> FormatContext<'a> {
    FormatContext {
        defaults: None,
        named: Some(named),
        currency: None,
    }
}

#[test]
fn a_registry_entry_named_for_a_type_also_suppresses_the_override() {
    // The registry is consulted on the same footing as the pack: an author who
    // names an entry `date` gets their own pattern, not a re-typing. This is
    // the one shape where the author, not the pack vendor, closes the shadow.
    let named = registry(&[("date", NamedFormatKind::Datetime, "yyyy.MM.dd HH:mm")]);
    let out = format_value(
        &json!(NOON),
        Some(&spec(FieldType::Datetime)),
        Some("date"),
        with_registry(&named),
        &builtin_ja(),
    )
    .expect("format");
    assert_eq!(out.text, "2026.11.03 14:05");
    assert_eq!(out.warning, None);
}

#[test]
fn the_registry_still_wins_over_the_pack_for_the_same_name() {
    // `named.or(from_pack)` order, preserved by the reorder: suppressing the
    // override must not also reshuffle the two real lookups.
    let named = registry(&[("wareki", NamedFormatKind::Datetime, "'registry' Gy")]);
    let out = format_value(
        &json!(NOON),
        Some(&spec(FieldType::Datetime)),
        Some("wareki"),
        with_registry(&named),
        &builtin_ja(),
    )
    .expect("format");
    assert_eq!(out.text, "registry 令和8");
}

#[test]
fn a_registry_entry_named_for_a_type_does_not_reach_a_non_dated_field() {
    // The guard is DATED-scoped. A registry entry spelled `currency` must not
    // turn a number field's `format: currency` into a date-pattern lookup —
    // the registry is a date vocabulary and a number has no business in it.
    let named = registry(&[("currency", NamedFormatKind::Date, "yyyy")]);
    let out = format_value(
        &json!(1234.5),
        Some(&spec(FieldType::Number)),
        Some("currency"),
        with_registry(&named),
        &builtin_ja(),
    )
    .expect("format");
    // Re-typed to currency (JPY drops the fraction), not rendered through the
    // registry's `yyyy` date pattern.
    assert_eq!(out.text, "1,234");
}
