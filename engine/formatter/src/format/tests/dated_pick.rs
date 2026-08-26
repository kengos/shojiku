//! A dated field's pick names a pack/registry VARIANT before it names a type.
//!
//! The defect: `format: date` on a datetime field is also a field-TYPE name,
//! so dispatch consumed it as a type override before any pack lookup — the
//! pack's own `datetimeFormats.date` was unreachable under its own name, and
//! an editor row labelled 「日付のみ」 rendered the date DEFAULT instead. Every
//! name no pack or registry declares still overrides, on every type.

use super::*;
use std::collections::BTreeMap;

const NOON: &str = "2026-11-03T14:05:00+09:00";

#[test]
fn a_pack_declared_type_name_reaches_the_pack_pattern() {
    // THE regression. ja-JP declares `datetimeFormats.date` as
    // `yyyy年M月d日(E)`, distinct from `dateFormats.default` — the one shipped
    // pack where the shadowing was ever visible.
    let out = fmt(
        &json!(NOON),
        Some(&spec(FieldType::Datetime)),
        Some("date"),
        &builtin_ja(),
    );
    assert_eq!(out, "2026年11月3日(火)");
    // Not the date default, which is what it used to render.
    assert_ne!(out, "2026/11/03(火)");
}

#[test]
fn a_declared_name_agrees_wherever_it_is_authored() {
    // The sharpest statement of what was wrong: the SAME spelling meant two
    // different things depending on where it was authored.
    //
    // Only the placement pick ever reached the type-override check —
    // `Field.format` and `defaults.formats.*` are read inside `effective()`,
    // downstream of it, so they resolved against the pack tables and were
    // CORRECT all along. So `{receipt.issued_at:date}` printed the date
    // default while the identical `format: date` in definitions printed the
    // pack's pattern, on the same field, in the same document.
    let pack = builtin_ja();
    let mut declared = spec(FieldType::Datetime);
    declared.format = Some("date".to_string());

    let by_definitions = fmt(&json!(NOON), Some(&declared), None, &pack);
    let by_placement = fmt(
        &json!(NOON),
        Some(&spec(FieldType::Datetime)),
        Some("date"),
        &pack,
    );
    assert_eq!(by_definitions, by_placement);
    assert_eq!(by_placement, "2026年11月3日(火)");

    // SCOPE, so the name is not read as more than it shows: the two agree for
    // a name the pack or registry DECLARES. A type-override name still means
    // different things in the two places, and always did — `Field.format =
    // "string"` on a date field never reaches the override check, so it warns
    // `unknown_format_variant` and renders the default, while the same
    // spelling as a placement pick re-types the value and renders it verbatim.
    // That half of the class is pre-existing and untouched here.
    let mut declared_string = spec(FieldType::Date);
    declared_string.format = Some("string".to_string());
    let out = fmt_warn(&json!(NOON), Some(&declared_string), None, &pack);
    assert!(
        matches!(out.warning, Some(FormatWarning::UnknownVariant(_))),
        "a type name in definitions is not an override: {:?}",
        out.warning
    );
}

#[test]
fn the_six_other_packs_render_the_same_either_way() {
    // Why the defect survived: en-US declares `datetimeFormats.date` too, as
    // the SAME pattern its date table defaults to. Reaching the pack key
    // instead of re-typing the field moves nothing here — so this pins that
    // the fix is a no-op for every pack but ja-JP.
    let en = builtin_en();
    let picked = fmt(
        &json!(NOON),
        Some(&spec(FieldType::Datetime)),
        Some("date"),
        &en,
    );
    let date_default = fmt(&json!(NOON), Some(&spec(FieldType::Date)), None, &en);
    assert_eq!(picked, date_default);
    assert_eq!(picked, "Nov 3, 2026");
}

#[test]
fn a_type_name_no_pack_declares_still_overrides_on_a_dated_field() {
    // The negative control on the dated side: `string` is a type name and no
    // pack declares it, so the override is untouched — the value renders
    // verbatim rather than through any pattern.
    let out = fmt(
        &json!(NOON),
        Some(&spec(FieldType::Datetime)),
        Some("string"),
        &builtin_ja(),
    );
    assert_eq!(out, NOON);
}

#[test]
fn date_on_a_date_field_is_still_an_override_and_still_a_no_op() {
    // No shipped pack declares `dateFormats.date`, so a DATE field's `date`
    // pick is not a declared variant and keeps overriding — to the type it
    // already is. Unchanged by the fix, and the reason the fix is scoped to
    // what a pack actually declares rather than to the spelling.
    let pack = builtin_ja();
    let picked = fmt(
        &json!("2026-11-03"),
        Some(&spec(FieldType::Date)),
        Some("date"),
        &pack,
    );
    assert_eq!(
        picked,
        fmt(
            &json!("2026-11-03"),
            Some(&spec(FieldType::Date)),
            None,
            &pack
        )
    );
    assert_eq!(picked, "2026/11/03(火)");
}

#[test]
fn datetime_on_a_date_field_still_re_types_and_gains_the_time() {
    // The other direction of the same override, still live: `datetime` is in
    // no pack's date table.
    let out = fmt(
        &json!(NOON),
        Some(&spec(FieldType::Date)),
        Some("datetime"),
        &builtin_ja(),
    );
    assert_eq!(out, "2026/11/03(火) 14:05");
}

#[test]
fn a_type_name_override_on_a_non_dated_field_is_untouched() {
    // The negative control on the other side. `dated::declares` returns false
    // for every non-dated type before it looks at anything, so a number's
    // `format: currency` re-types exactly as before.
    let pack = builtin_ja();
    let out = fmt(
        &json!(1234.5),
        Some(&spec(FieldType::Number)),
        Some("currency"),
        &pack,
    );
    // JPY carries no fraction digits, so the re-typing is what drops the `.5`
    // — the same value as a plain number keeps it.
    assert_eq!(out, "1,234");
    assert_eq!(
        fmt(&json!(1234.5), Some(&spec(FieldType::Number)), None, &pack),
        "1,234.5"
    );
}

#[test]
fn an_untyped_value_that_is_not_a_date_still_overrides_to_date() {
    // With no definitions the type is INFERRED, so `"not-a-date"` is a string
    // and `format: date` is the override that forces date parsing — which is
    // what makes a garbage value report `format_error` instead of drawing
    // itself. Two e2e placeholder suites rest on this.
    let out = format_value(
        &json!("not-a-date"),
        None,
        Some("date"),
        FormatContext::default(),
        &builtin_ja(),
    );
    assert!(matches!(out, Err(FormatError::InvalidDatetime(_))));
}

#[test]
fn an_undeclared_name_still_degrades_with_the_name_clipped() {
    // The guard must not swallow the unknown-variant warning, and the echoed
    // name is still bounded — the spelling is attacker-influenceable.
    let long = "x".repeat(500);
    let out = fmt_warn(
        &json!(NOON),
        Some(&spec(FieldType::Datetime)),
        Some(&long),
        &builtin_ja(),
    );
    assert_eq!(out.text, "2026/11/03(火) 14:05");
    let Some(FormatWarning::UnknownVariant(echoed)) = out.warning else {
        panic!("expected an unknown-variant warning, got {:?}", out.warning);
    };
    assert!(echoed.chars().count() < long.chars().count());
}

/// Renders `pattern` straight, as a `defaults` INLINE pattern — the one pick
/// shape that takes neither the type-override check nor the name lookup. It is
/// what lets a test say "the name reached its own pattern" without re-deriving
/// how the name is resolved.
fn fmt_inline(value: &Value, field_type: FieldType, pattern: &str, pack: &LangPack) -> String {
    let inline = FormatRef::Inline(shojiku_core::InlineFormat {
        pattern: pattern.to_string(),
    });
    let defaults = match field_type {
        FieldType::Datetime => FormatDefaults {
            datetime: Some(inline),
            ..FormatDefaults::default()
        },
        _ => FormatDefaults {
            date: Some(inline),
            ..FormatDefaults::default()
        },
    };
    let ctx = FormatContext {
        defaults: Some(&defaults),
        named: None,
        currency: None,
    };
    let out = format_value(value, Some(&spec(field_type)), None, ctx, pack).expect("format");
    assert_eq!(out.warning, None, "inline pattern `{pattern}` warned");
    out.text
}

#[test]
fn every_key_a_dated_pack_table_declares_is_reachable_by_its_own_name() {
    // The universal the fix delivers: no key a pack authored is unreachable
    // because its spelling happens to collide with a field-TYPE name. Both
    // builtin packs, every key of every table each dated type reads.
    //
    // The comparison is against the pattern rendered DIRECTLY (an inline
    // `defaults` pattern, which takes neither the override nor the name
    // lookup), so this cannot pass by re-deriving the guard it is checking —
    // and `fmt` asserts the pick is clean, so a key that resolved by
    // DEGRADING to the default would fail here too.
    for pack in [builtin_ja(), builtin_en()] {
        for field_type in [FieldType::Date, FieldType::Datetime] {
            // The tables that type reads, in resolution order; a key in both
            // resolves to the FIRST, so later tables only contribute keys the
            // earlier ones do not hold.
            let tables: Vec<&BTreeMap<String, String>> = match field_type {
                FieldType::Datetime => vec![&pack.datetime_formats, &pack.date_formats],
                _ => vec![&pack.date_formats],
            };
            let mut seen: Vec<&String> = Vec::new();
            for table in tables {
                for (name, pattern) in table {
                    if seen.contains(&name) {
                        continue;
                    }
                    seen.push(name);
                    assert_eq!(
                        fmt(&json!(NOON), Some(&spec(field_type)), Some(name), &pack),
                        fmt_inline(&json!(NOON), field_type, pattern, &pack),
                        "`{name}` on {field_type:?} did not reach its own pattern"
                    );
                }
            }
            assert!(
                seen.len() > 2,
                "{field_type:?} swept only {} keys — the table walk is broken, not clean",
                seen.len()
            );
        }
    }
}
