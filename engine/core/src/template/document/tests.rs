//! Wire tests for `document:`: parse shapes, typo rejection, round-trip.

use crate::template::parse_template;

fn with_document(block: &str) -> String {
    format!("{block}sections:\n  body:\n    type: flow\n    items: []\n")
}

#[test]
fn document_parses_every_field() {
    let template = parse_template(&with_document(concat!(
        "document:\n",
        "  title: \"請求書 {invoice.number}\"\n",
        "  description: 月次請求書\n",
        "  keywords: [invoice, \"{customer.name}\"]\n",
        "  language: ja-JP\n",
        "  authors: [\"{issuer.name}\", 経理部]\n",
    )))
    .expect("template");
    let meta = &template.document;
    assert_eq!(meta.title.as_deref(), Some("請求書 {invoice.number}"));
    assert_eq!(meta.description.as_deref(), Some("月次請求書"));
    assert_eq!(meta.keywords, ["invoice", "{customer.name}"]);
    assert_eq!(meta.language.as_deref(), Some("ja-JP"));
    assert_eq!(meta.authors, ["{issuer.name}", "経理部"]);
    assert!(!meta.is_empty());
}

#[test]
fn document_rejects_unknown_keys_and_non_scalars() {
    // Typo safety: a misspelled key is a parse error, never a silent drop —
    // and it names where it is, so the author can find it.
    let typo = with_document("document:\n  titel: x\n");
    let err = parse_template(&typo).expect_err("typo rejected");
    assert!(err.to_string().contains("document"), "{err}");
    // `creationDate` is deliberately not authorable (determinism) — it must
    // reject like any other unknown key rather than being quietly accepted.
    let date = with_document("document:\n  creationDate: 2026-01-01\n");
    assert!(parse_template(&date).is_err());
    // A list where a scalar belongs is a parse error, not a stringified list.
    let list = with_document("document:\n  title: [a, b]\n");
    assert!(parse_template(&list).is_err());
    // ... and a scalar where a list belongs.
    let scalar = with_document("document:\n  keywords: invoice\n");
    assert!(parse_template(&scalar).is_err());
}

#[test]
fn document_round_trips_and_unset_never_serializes() {
    let authored =
        parse_template(&with_document("document:\n  title: 見積書\n")).expect("authored");
    let yaml = serde_yaml::to_string(&authored).expect("yaml");
    assert!(yaml.contains("title: 見積書"), "{yaml}");
    // Only the authored key: no empty description/keywords/language/authors.
    assert!(!yaml.contains("description"), "{yaml}");
    assert!(!yaml.contains("keywords"), "{yaml}");

    let bare = parse_template(&with_document("")).expect("bare");
    assert!(bare.document.is_empty());
    let bare_yaml = serde_yaml::to_string(&bare).expect("yaml");
    assert!(!bare_yaml.contains("document"), "{bare_yaml}");
}

#[test]
fn is_empty_is_false_for_each_field_alone() {
    // Every field must hold the block open on its own — a skip predicate
    // that missed one would silently drop that key on round-trip.
    for block in [
        "  title: t\n",
        "  description: d\n",
        "  keywords: [k]\n",
        "  language: ja-JP\n",
        "  authors: [a]\n",
    ] {
        let template =
            parse_template(&with_document(&format!("document:\n{block}"))).expect("template");
        assert!(!template.document.is_empty(), "{block}");
        let yaml = serde_yaml::to_string(&template).expect("yaml");
        assert!(yaml.contains("document:"), "{block} -> {yaml}");
    }
}
