//! The format-catalog op: the session gate, the parse-failure fallback, and
//! the probe-list parser (which lives in the pure core precisely so these
//! host gates reach it — the wasm shim compiles for no other target).

use super::*;
use shojiku_authoring::MAX_PROBES;
use shojiku_diagnostics::ArgValue;

const TEMPLATE: &str = "formats:\n  stamp: { type: date, pattern: \"yyyy.MM.dd\" }\n\
                        sections:\n  body:\n    type: flow\n    items: []\n";

fn with_locale() -> Session {
    let mut session = Session::new();
    session.set_locale("ja-JP", None).expect("locale");
    session
}

#[test]
fn the_catalog_needs_a_locale() {
    let err = Session::new()
        .format_catalog(TEMPLATE, &[])
        .expect_err("no locale");
    assert_eq!(err.code(), "locale_not_set");
}

#[test]
fn a_registry_entry_reaches_the_catalog_with_its_rendered_sample() {
    let catalog = with_locale()
        .format_catalog(TEMPLATE, &[])
        .expect("catalog");
    let date = catalog
        .types
        .iter()
        .find(|t| t.field_type == "date")
        .expect("date");
    let stamp = date
        .variants
        .iter()
        .find(|v| v.spelling == "stamp")
        .expect("the registry entry is offered");
    assert_eq!(stamp.samples, vec!["2026.11.03".to_string()]);
}

#[test]
fn a_template_that_does_not_parse_still_answers_without_its_registry() {
    // The editor-shaped decision: a picker that empties out mid-keystroke is
    // worse than one that keeps the locale's vocabulary. Fonts are not
    // needed — nothing here lays anything out.
    let catalog = with_locale()
        .format_catalog("this: is: not: a: template", &[])
        .expect("catalog");
    let date = catalog
        .types
        .iter()
        .find(|t| t.field_type == "date")
        .expect("date");
    assert!(!date.variants.is_empty(), "the pack's variants survive");
    assert!(date.variants.iter().all(|v| v.spelling != "stamp"));
}

#[test]
fn a_probe_rides_through_to_the_catalog() {
    let probes = parse_probes(r#"[{"fieldType":"date","pattern":"yyyy/MM/dd"}]"#).expect("probes");
    let catalog = with_locale()
        .format_catalog(TEMPLATE, &probes)
        .expect("catalog");
    assert_eq!(catalog.probes[0].sample, "2026/11/03");
}

#[test]
fn an_empty_probe_list_is_accepted() {
    assert!(parse_probes("[]").expect("probes").is_empty());
}

#[test]
fn a_malformed_probe_list_is_refused_not_defaulted() {
    let err = parse_probes("{}").expect_err("not an array");
    assert_eq!(err.code(), "bad_probes");
}

#[test]
fn an_unknown_probe_key_is_refused() {
    // `deny_unknown_fields`: a mistyped key must not be silently dropped,
    // leaving the probe running against an empty pattern.
    let err = parse_probes(r#"[{"fieldType":"date","patern":"d"}]"#).expect_err("typo");
    assert_eq!(err.code(), "bad_probes");
}

#[test]
fn a_type_with_no_pattern_form_is_refused() {
    // `currency` parses as a field type and has no pattern form at all, so
    // accepting it would answer a question the wire cannot be asked.
    let err = parse_probes(r#"[{"fieldType":"currency","pattern":"d"}]"#).expect_err("no form");
    assert_eq!(err.code(), "bad_probes");
    assert!(err.to_string().contains("currency"));
}

#[test]
fn an_unknown_type_name_is_refused_with_the_name_sanitized() {
    // The name is echoed back, and it is host-supplied — a bidi override
    // would reorder the whole message without changing a byte of it.
    let err = parse_probes("[{\"fieldType\":\"a\u{202e}b\",\"pattern\":\"d\"}]")
        .expect_err("unknown type");
    assert!(!err.to_string().contains('\u{202e}'));
}

#[test]
fn an_absurd_probe_count_is_refused_outright() {
    let many: Vec<String> = (0..MAX_PROBES * 2 + 1)
        .map(|_| r#"{"fieldType":"date","pattern":"d"}"#.to_string())
        .collect();
    let err = parse_probes(&format!("[{}]", many.join(","))).expect_err("too many");
    assert_eq!(err.code(), "bad_probes");
}

#[test]
fn a_probe_count_within_the_refusal_bound_is_marked_individually() {
    // Between MAX_PROBES and the outright refusal, the catalog answers and
    // marks the overflow rather than throwing — the host asked a slightly
    // large question, not a nonsensical one.
    let many: Vec<String> = (0..MAX_PROBES + 1)
        .map(|_| r#"{"fieldType":"date","pattern":"d"}"#.to_string())
        .collect();
    let probes = parse_probes(&format!("[{}]", many.join(","))).expect("accepted");
    let catalog = with_locale()
        .format_catalog(TEMPLATE, &probes)
        .expect("catalog");
    assert!(catalog.probes[MAX_PROBES].refused.is_some());
}

/// The zh-TW pack as a host sends it: whole-pack text for a non-builtin id.
fn zh_tw_pack_text() -> String {
    let file =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/locale/zh-tw.yml");
    std::fs::read_to_string(file).expect("read the shipped zh-TW pack")
}

#[test]
fn the_locale_facts_op_needs_no_session_locale() {
    // It answers about a locale the host NAMES, not about the one the session
    // renders through — so a session that has never called `set_locale` still
    // gets an answer. Asserting the gate is ABSENT, since every sibling op
    // here has one.
    let facts = Session::new()
        .locale_facts(TEMPLATE, "ja-JP", None)
        .expect("facts with no session locale");
    assert_eq!(facts.id, "ja-JP");
    assert_eq!(facts.currency_default, "JPY");
}

#[test]
fn the_locale_facts_op_leaves_the_sessions_own_pack_alone() {
    // The load-bearing property: the panel explains one locale while the
    // preview keeps rendering another. A `set_locale` here would move the
    // preview under the reader.
    let session = with_locale();
    let facts = session
        .locale_facts(TEMPLATE, "zh-TW", Some(&zh_tw_pack_text()))
        .expect("facts for a pack locale");
    assert_eq!(facts.id, "zh-TW");
    assert_eq!(facts.currency_default, "TWD");
    // Still ja-JP afterwards, asked through a path that reads the pack.
    let catalog = session.format_catalog(TEMPLATE, &[]).expect("catalog");
    let date = catalog
        .types
        .iter()
        .find(|t| t.field_type == "date")
        .expect("date");
    assert!(
        date.variants.iter().any(|v| v.spelling == "wareki"),
        "the session is still on the ja pack"
    );
}

#[test]
fn the_document_currency_reaches_the_locale_facts() {
    let template =
        "defaults:\n  currency: USD\nsections:\n  body:\n    type: flow\n    items: []\n";
    let facts = Session::new()
        .locale_facts(template, "ja-JP", None)
        .expect("facts");
    assert_eq!(facts.currency_default, "JPY", "the PACK's default");
    // USD's two fraction digits, where the pack's own JPY has none. Neither
    // sample carries a symbol — a bare binding renders the grouped amount.
    assert_eq!(facts.amount, "1,234,567.89", "the DOCUMENT's currency");
}

#[test]
fn a_locale_the_host_cannot_supply_is_refused_rather_than_guessed() {
    let err = Session::new()
        .locale_facts(TEMPLATE, "zz-ZZ", None)
        .expect_err("no builtin and no overlay");
    assert_eq!(err.code(), "locale_error");
}

#[test]
fn a_malformed_overlay_is_a_typed_refusal_not_a_panic() {
    let err = Session::new()
        .locale_facts(TEMPLATE, "zz-ZZ", Some("id: [unclosed"))
        .expect_err("malformed pack");
    assert_eq!(err.code(), "locale_error");
}

#[test]
fn a_hostile_locale_id_is_refused_and_its_echo_is_bounded() {
    // `defaults.locale` is author-typed, so this id is attacker-influenceable
    // and it is ECHOED on the not-found error. The bound is the diagnostics
    // arg guard (control-strip + clip), the same one every other host-misuse
    // detail rides.
    let hostile = format!("{}\u{7}\u{0}", "z".repeat(5_000));
    let err = Session::new()
        .locale_facts(TEMPLATE, &hostile, None)
        .expect_err("not a locale");
    assert_eq!(err.code(), "locale_error");
    let args = err.args();
    let (_, detail) = args
        .iter()
        .find(|(k, _)| *k == "detail")
        .expect("the detail arg");
    let ArgValue::Str(text) = detail else {
        panic!("the detail arg is text");
    };
    assert!(
        text.chars().count() <= shojiku_diagnostics::MAX_ECHO,
        "clipped to the shared echo bound"
    );
    assert!(
        !text.chars().any(|c| c.is_control()),
        "control bytes stripped"
    );
}

#[test]
fn a_prototype_shaped_locale_id_names_nothing() {
    // The GUI side reads this table by tag; a `__proto__` must reach a miss,
    // never an inherited value. Engine-side that is a plain not-found, and
    // pinning it here is what keeps it one.
    for id in ["__proto__", "constructor", "toString"] {
        let err = Session::new()
            .locale_facts(TEMPLATE, id, None)
            .expect_err("not a locale");
        assert_eq!(err.code(), "locale_error", "{id}");
    }
}
