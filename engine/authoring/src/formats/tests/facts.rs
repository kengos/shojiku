//! Locale-facts tests.
//!
//! The goldens ARE the load-bearing part here, unusually: this query exists
//! to replace a hand-copied table in an editor, so what it must prove is
//! that each locale's answer is its OWN and that the values discriminate
//! the choice a reader is making. Two do so explicitly — the Indian
//! grouping sizes and the Buddhist year — because those are the two claims
//! the retired table's drift guard made.

use super::*;

/// Every engine-resolvable locale this repository ships, by its own id: the
/// two formatter builtins, then the five files under `packs/locale/`.
///
/// The file packs are read from the repository the way `test_support`'s font
/// store reads `packs/fonts/` — these are the packs an editor's locale picker
/// actually offers, so pinning the builtins alone would leave the five that
/// carry the interesting behaviour (Indian grouping, a Buddhist era) unproven
/// at this layer.
fn pack(id: &str) -> LangPack {
    if let Some(builtin) = LangPack::builtin(id, None).expect("parse builtin") {
        return builtin;
    }
    let file = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packs/locale")
        .join(format!("{}.yml", id.to_lowercase()));
    LangPack::load(&file).expect("load shipped locale pack")
}

/// One locale's four facts, as a tuple, so a per-pack row reads as a row.
fn facts_of(pack: &LangPack) -> (String, String, String, String) {
    let f = locale_facts(None, pack);
    (f.date, f.number, f.currency_default, f.amount)
}

#[test]
fn each_shipped_locale_reports_its_own_facts() {
    // Written by guessing from the pack files and corrected against real
    // output; every row is one locale's answer, never a shared expectation
    // (a locale that legitimately differs must be able to say so).
    let rows: [(&str, &str, &str, &str, &str); 7] = [
        (
            "ja-JP",
            "2026/11/03(火)",
            "12,345,678.9",
            "JPY",
            "1,234,568",
        ),
        (
            "en-US",
            "Nov 3, 2026",
            "12,345,678.9",
            "USD",
            "1,234,567.89",
        ),
        (
            "zh-CN",
            "2026年11月3日",
            "12,345,678.9",
            "CNY",
            "1,234,567.89",
        ),
        (
            "zh-TW",
            "2026年11月3日",
            "12,345,678.9",
            "TWD",
            "1,234,567.89",
        ),
        (
            "hi-IN",
            "3 नव॰ 2026",
            "1,23,45,678.9",
            "INR",
            "12,34,567.89",
        ),
        (
            "fil-PH",
            "Nob 3, 2026",
            "12,345,678.9",
            "PHP",
            "1,234,567.89",
        ),
        (
            "th-TH",
            "3 พ.ย. 2569",
            "12,345,678.9",
            "THB",
            "1,234,567.89",
        ),
    ];
    for (id, date, number, currency, amount) in rows {
        let p = pack(id);
        assert_eq!(p.id, id, "the pack's own id");
        assert_eq!(locale_facts(None, &p).id, id, "facts echo the pack id");
        assert_eq!(
            facts_of(&p),
            (
                date.to_string(),
                number.to_string(),
                currency.to_string(),
                amount.to_string()
            ),
            "{id}"
        );
    }
}

#[test]
fn the_number_sample_shows_the_grouping_rule_not_just_the_separator() {
    // The regression the exemplar's LENGTH exists to prevent: at four
    // digits every shipped locale groups identically, so a panel explaining
    // the pick would read the same for a lakh/crore locale as for the rest.
    assert_eq!(locale_facts(None, &pack("hi-IN")).number, "1,23,45,678.9");
    for id in ["ja-JP", "en-US", "zh-CN", "zh-TW", "fil-PH", "th-TH"] {
        assert_eq!(locale_facts(None, &pack(id)).number, "12,345,678.9", "{id}");
    }
}

#[test]
fn the_date_sample_reports_the_buddhist_year_for_th_th() {
    // th-TH is the one shipped locale whose date sample is not a
    // re-spelling of the same year: its pack carries an era table, so the
    // exemplar's 2026 CE prints as 2569 BE. A sample showing 2026 would
    // under-describe the pick in exactly the way this query exists to stop.
    assert!(locale_facts(None, &pack("th-TH")).date.contains("2569"));
    for id in ["ja-JP", "en-US", "zh-CN", "zh-TW", "hi-IN", "fil-PH"] {
        assert!(locale_facts(None, &pack(id)).date.contains("2026"), "{id}");
    }
}

#[test]
fn an_undeclared_document_gets_fraction_digits_and_no_symbol() {
    // JPY has no fraction digits and USD has two, which is what makes the
    // amount worth showing: the currency pick changes the PRECISION.
    //
    // With nothing declared neither carries a symbol, and that is not an
    // omission — a bare binding renders the grouped amount, because `symbol`
    // and `name` are variants a placement picks per field. A document that
    // DECLARES one gets it instead; the next test is that half, and the
    // pairing is what stops either sentence being read as the whole rule.
    assert_eq!(locale_facts(None, &pack("ja-JP")).amount, "1,234,568");
    assert_eq!(locale_facts(None, &pack("en-US")).amount, "1,234,567.89");
    for id in ["ja-JP", "en-US", "hi-IN", "th-TH"] {
        let amount = locale_facts(None, &pack(id)).amount;
        assert!(
            amount
                .chars()
                .all(|c| c.is_ascii_digit() || c == ',' || c == '.'),
            "{id} renders digits and separators only, got {amount}"
        );
    }
}

#[test]
fn the_documents_own_currency_wins_over_the_packs_default() {
    // The panel explains the pair (locale, currency), so the amount has to
    // follow the document's `defaults.currency` — the pack's default is
    // only what an unset key falls back to.
    let t = template("defaults:\n  currency: USD\n");
    let f = locale_facts(Some(&t), &ja());
    assert_eq!(f.currency_default, "JPY", "the PACK's default is reported");
    // USD's two fraction digits, where the pack's own JPY has none — the
    // amount is what SHOWS the document's pick, since neither carries a
    // symbol.
    assert_eq!(f.amount, "1,234,567.89", "the DOCUMENT's currency renders");
}

#[test]
fn no_document_at_all_falls_back_to_the_packs_own_currency() {
    // The live-editor case: `None` is what a host passes while somebody is
    // mid-keystroke and the document does not parse. A panel that empties out
    // then is worse than one still describing the locale — so the answer is
    // the pack's, and it must DIFFER from the document-carrying one above,
    // or this test would hold for an implementation that ignores the
    // template entirely.
    let with_usd = locale_facts(Some(&template("defaults:\n  currency: USD\n")), &ja());
    let without = locale_facts(None, &ja());
    assert_eq!(without.amount, "1,234,568");
    assert_ne!(without.amount, with_usd.amount);
}

#[test]
fn a_pack_declaring_no_default_currency_reports_an_empty_code() {
    // The engine reports what the pack says and invents nothing; whether to
    // show a currency sentence at all is the caller's decision.
    let bare = LangPack::from_yaml_str("id: xx-YY\n").expect("parse minimal pack");
    let f = locale_facts(None, &bare);
    assert_eq!(f.currency_default, "");
    assert_eq!(f.id, "xx-YY");
}

#[test]
fn the_facts_render_through_the_same_dispatch_as_the_catalog() {
    // The invariant this whole module exists for: one dispatch, no second
    // formatter. The facts render at NO variant (what a bare `{key}`
    // binding resolves) and the catalog lists a `default` row; asserting
    // they agree is what would catch the two drifting apart.
    let t = empty_template();
    let cat = format_catalog(Some(&t), &ja(), &[]);
    let f = locale_facts(Some(&t), &ja());
    assert_eq!(f.date, sample_for(&cat, "date", "default"));
    assert_eq!(f.number, sample_for(&cat, "number", "default"));
    assert_eq!(f.amount, sample_for(&cat, "currency", "default"));
}

#[test]
fn the_documents_per_type_format_default_reaches_the_amount() {
    // The facts describe THIS document, not a hypothetical bare one: a
    // template whose `defaults.formats.currency` names `symbol` prints
    // amounts with the symbol, so the sample shows the symbol.
    //
    // Found by driving the real app — every bundled receipt declares exactly
    // this, while every unit test up to here passed a document that did not,
    // so the whole suite agreed on a rule that held for none of the shipped
    // documents.
    let t = template("defaults:\n  formats:\n    currency: symbol\n");
    assert_eq!(locale_facts(Some(&t), &ja()).amount, "¥1,234,568");
    // …and the same pack with nothing declared gives the bare form, so the
    // assertion above is about the DOCUMENT rather than about the pack.
    assert_eq!(locale_facts(None, &ja()).amount, "1,234,568");
}
