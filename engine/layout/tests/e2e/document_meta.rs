//! `document:` metadata end to end — mirrors `src/engine/meta.rs`: the
//! resolved values that reach the tree, the two fallback chains, and
//! what a hostile params value does to them.

use super::common::run;
use serde_json::json;

fn body() -> &'static str {
    "sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: x\n"
}

fn meta(document_block: &str, params: serde_json::Value) -> shojiku_layout::DocumentMetadata {
    let (doc, diags) = run(&format!("{document_block}{}", body()), params);
    assert!(!diags.has_errors(), "{diags:?}");
    doc.metadata
}

fn meta_with_diags(
    document_block: &str,
    params: serde_json::Value,
) -> (shojiku_layout::DocumentMetadata, Vec<String>) {
    let (doc, diags) = run(&format!("{document_block}{}", body()), params);
    let codes = diags.iter().map(|d| d.code.as_str().to_string()).collect();
    (doc.metadata, codes)
}

#[test]
fn every_field_interpolates_from_params() {
    let resolved = meta(
        concat!(
            "document:\n",
            "  title: \"請求書 {invoice.number}\"\n",
            "  description: \"{customer.name} 様宛\"\n",
            "  keywords: [invoice, \"{customer.name}\"]\n",
            "  language: ja-JP\n",
            "  authors: [\"{issuer}\", 経理部]\n",
        ),
        json!({
            "invoice": { "number": "A-1001" },
            "customer": { "name": "山田商店" },
            "issuer": "田中",
        }),
    );
    assert_eq!(resolved.title, "請求書 A-1001");
    assert_eq!(resolved.description.as_deref(), Some("山田商店 様宛"));
    assert_eq!(resolved.keywords, ["invoice", "山田商店"]);
    assert_eq!(resolved.language.as_deref(), Some("ja-JP"));
    assert_eq!(resolved.authors, ["田中", "経理部"]);
}

#[test]
fn the_title_falls_back_through_name_to_the_default() {
    // Authored title wins…
    let titled = meta("document:\n  title: 見積書\nname: ignored\n", json!({}));
    assert_eq!(titled.title, "見積書");
    // …then the template name (what every pre-`document:` template gets)…
    let named = meta("name: Invoice\n", json!({}));
    assert_eq!(named.title, "Invoice");
    // …then the engine default.
    let bare = meta("", json!({}));
    assert_eq!(bare.title, shojiku_layout::DEFAULT_DOCUMENT_TITLE);
    assert_eq!(bare.description, None);
    assert!(bare.keywords.is_empty());
    assert_eq!(bare.language, None);
    assert!(bare.authors.is_empty());
}

#[test]
fn the_language_falls_back_to_the_document_locale() {
    let explicit = meta(
        "document:\n  language: en-GB\ndefaults: { locale: ja-JP }\n",
        json!({}),
    );
    assert_eq!(explicit.language.as_deref(), Some("en-GB"));
    let inherited = meta("defaults: { locale: ja-JP }\n", json!({}));
    assert_eq!(inherited.language.as_deref(), Some("ja-JP"));
    let neither = meta("", json!({}));
    assert_eq!(neither.language, None);
}

#[test]
fn a_blank_binding_writes_nothing_and_says_nothing_extra() {
    let (resolved, codes) = meta_with_diags(
        "document:\n  description: \"{note}\"\n  keywords: [\"{note}\", real]\n",
        json!({ "note": "" }),
    );
    assert_eq!(resolved.description, None);
    assert_eq!(resolved.keywords, ["real"]);
    // Blank is not a metadata reject — nothing beyond the ordinary
    // missing-data reporting shows up.
    assert!(
        !codes.iter().any(|c| c.starts_with("document_metadata_")),
        "{codes:?}"
    );
}

#[test]
fn a_hostile_language_from_params_is_dropped_with_a_warning() {
    // The XMP packet writes a language tag unescaped, so this is the value
    // that must never reach the renderer.
    let (resolved, codes) = meta_with_diags(
        "document:\n  language: \"{lang}\"\n",
        json!({ "lang": "ja\"><rdf:li>evil" }),
    );
    assert_eq!(resolved.language, None);
    assert_eq!(
        codes
            .iter()
            .filter(|c| *c == "invalid_document_language")
            .count(),
        1,
        "{codes:?}"
    );
}

#[test]
fn a_rejected_language_does_not_silently_inherit_the_locale() {
    // Falling back here would write a locale the author never asked for
    // over the value they did — the reject must stay a reject.
    let (resolved, codes) = meta_with_diags(
        "document:\n  language: \"ja JP\"\ndefaults: { locale: en-US }\n",
        json!({}),
    );
    assert_eq!(resolved.language, None);
    assert!(codes.iter().any(|c| c == "invalid_document_language"));
}

#[test]
fn a_rejected_title_does_not_silently_become_the_template_name() {
    // Same rule as the language: a fallback covers an ABSENT value, never
    // one the gate refused — otherwise the refusal hides behind output
    // that looks deliberate.
    let (resolved, codes) = meta_with_diags(
        "name: Invoice\ndocument:\n  title: \"{t}\"\n",
        json!({ "t": "x\u{0}y" }),
    );
    assert_eq!(resolved.title, shojiku_layout::DEFAULT_DOCUMENT_TITLE);
    assert!(codes.iter().any(|c| c == "document_metadata_control_chars"));
}

#[test]
fn control_characters_drop_the_field_and_keep_its_siblings() {
    let (resolved, codes) = meta_with_diags(
        concat!(
            "document:\n",
            "  title: \"{bad}\"\n",
            "  description: fine\n",
            "  keywords: [\"{bad}\", good]\n",
            "  authors: [ok, \"{bad}\"]\n",
        ),
        json!({ "bad": "x\u{0}y" }),
    );
    // The title reject falls through the chain to the engine default.
    assert_eq!(resolved.title, shojiku_layout::DEFAULT_DOCUMENT_TITLE);
    assert_eq!(resolved.description.as_deref(), Some("fine"));
    // Both lists gate per ENTRY: the bad one drops, its siblings stay.
    assert_eq!(resolved.keywords, ["good"]);
    assert_eq!(resolved.authors, ["ok"]);
    assert_eq!(
        codes
            .iter()
            .filter(|c| *c == "document_metadata_control_chars")
            .count(),
        3,
        "{codes:?}"
    );
}

#[test]
fn an_oversized_params_value_is_dropped() {
    let (resolved, codes) = meta_with_diags(
        "document:\n  description: \"{blob}\"\n",
        json!({ "blob": "a".repeat(4096) }),
    );
    assert_eq!(resolved.description, None);
    assert!(codes.iter().any(|c| c == "document_metadata_too_long"));
}

#[test]
fn xml_metacharacters_reach_the_tree_verbatim() {
    // They are escaped downstream; over-rejecting them would lose real
    // titles. The renderer's own suite pins the escaping.
    let resolved = meta(
        "document:\n  title: \"{t}\"\n",
        json!({ "t": "Q&A <2026> \"final\"" }),
    );
    assert_eq!(resolved.title, "Q&A <2026> \"final\"");
}

#[test]
fn metadata_reads_top_level_params_even_beside_a_repeat() {
    // `document:` is document-scoped: a key that exists BOTH top-level and
    // per element must resolve to the top-level one, never to a cell's.
    let (doc, diags) = run(
        concat!(
            "document:\n",
            "  title: \"{name}\"\n",
            "sections:\n",
            "  body:\n",
            "    type: flow\n",
            "    items:\n",
            "      - type: repeat_flow\n",
            "        data: { key: rows }\n",
            "        item:\n",
            "          box: { w: 200 }\n",
            "          items:\n",
            "            - type: text\n",
            "              data: { key: name }\n",
        ),
        json!({
            "name": "the document",
            "rows": [{ "name": "a row" }, { "name": "another row" }],
        }),
    );
    assert!(!diags.has_errors(), "{diags:?}");
    assert_eq!(doc.metadata.title, "the document");
}

#[test]
fn an_over_cap_list_keeps_only_the_admitted_entries() {
    let mut block = String::from("document:\n  keywords:\n");
    for i in 0..(shojiku_core::MAX_DOCUMENT_ENTRIES + 3) {
        block.push_str(&format!("    - k{i}\n"));
    }
    let resolved = meta(&block, json!({}));
    assert_eq!(resolved.keywords.len(), shojiku_core::MAX_DOCUMENT_ENTRIES);
    assert_eq!(resolved.keywords[0], "k0");
}
