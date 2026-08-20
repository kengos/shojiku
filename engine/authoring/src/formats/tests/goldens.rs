//! What the catalog EMITS, pinned per (type, variant), for both builtin packs.
//!
//! The precedent is the `yy` double-year bug: two packs rendered
//! `14/3/20262026` for a whole release because only `dateFormats.default` was
//! ever pinned. A catalog is the surface where that class hides best — an
//! editor shows every variant, so a wrong one reaches a reader before any test
//! does.
//!
//! Scope, stated rather than assumed: this pins the two BUILTIN packs, which
//! are the ones the catalog can reach with no filesystem. The five shipped
//! FILE packs are pinned in `engine/formatter/tests/shipped_packs` against the
//! same formatter this calls through, and the catalog adds no per-pack logic —
//! it reads a pack's `dateFormats`/`datetimeFormats` keys generically, which
//! `en_us_offers_its_own_vocabulary_and_no_wareki` is what proves.

use super::*;

fn en() -> LangPack {
    LangPack::builtin("en-US", None)
        .expect("parse builtin en-US")
        .expect("builtin en-US exists")
}

/// Every (type, variant) → sample the catalog emits, as `type/spelling=sample`
/// lines, sorted. One assertion covering the whole surface: a variant that
/// appears, disappears, or renders differently all show up as a diff.
fn golden(pack: &LangPack) -> Vec<String> {
    let template = empty_template();
    let cat = format_catalog(Some(&template), pack, &[]);
    let mut out: Vec<String> = cat
        .types
        .iter()
        .flat_map(|t| {
            t.variants
                .iter()
                .map(move |v| format!("{}/{}={}", t.field_type, v.spelling, v.samples.join(" / ")))
        })
        .collect();
    out.sort();
    out
}

#[test]
fn ja_jp_emits_every_variant_it_declares() {
    // `datetime/date` renders the DATE default rather than the pack's own
    // `datetimeFormats.date` pattern: `date` is a field-TYPE name, so format
    // dispatch takes it as a type override before any pack lookup. The pack
    // key is therefore unreachable under its own name — a pre-existing
    // shadowing the catalog reports faithfully rather than hides.
    assert_eq!(
        golden(&ja()),
        vec![
            "currency/default=1,234,568",
            "currency/name=1,234,568円",
            "currency/symbol=¥1,234,568",
            "date/compact=2026/11/03",
            "date/default=2026/11/03(火)",
            "date/long=2026年11月3日(火)",
            "date/wareki-compact=R8.11.3",
            "date/wareki=令和8年11月3日",
            "datetime/compact=2026/11/03",
            "datetime/date=2026/11/03(火)",
            "datetime/default=2026/11/03(火) 14:05",
            "datetime/ja=2026年11月3日(火) 14:05",
            "datetime/long=2026年11月3日(火) 14:05",
            "datetime/wareki-compact=R8.11.3",
            "datetime/wareki=令和8年11月3日 14:05",
            "number/default=12,345,678.9",
            "percentage/default=12.34%",
            "quantity/default=1点 / 12,345点",
        ]
    );
}

#[test]
fn en_us_offers_its_own_vocabulary_and_no_wareki() {
    // The second builtin is the proof that the vocabulary comes from the PACK
    // rather than from a table here: no `wareki`, a different `compact`, and
    // a currency default that is not the yen.
    assert_eq!(
        golden(&en()),
        vec![
            "currency/default=1,234,567.89",
            "currency/name=1,234,567.89 US dollars",
            "currency/symbol=$1,234,567.89",
            "date/compact=11/03/2026",
            "date/default=Nov 3, 2026",
            "date/long=Tuesday, November 3, 2026",
            "datetime/compact=11/03/2026",
            "datetime/date=Nov 3, 2026",
            "datetime/default=Nov 3, 2026, 2:05 PM",
            "datetime/long=Tuesday, November 3, 2026, 2:05 PM",
            "number/default=12,345,678.9",
            "percentage/default=12.34%",
            "quantity/default=1 item / 12,345 items",
        ]
    );
}
