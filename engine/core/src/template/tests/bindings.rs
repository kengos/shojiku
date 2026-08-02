//! Parsing and round-trip serialization of named binding declarations
//! (`bindings:`) on the five items that own an interpolating string.

use super::super::*;

/// A one-item flow body.
fn one(item: &str) -> Result<Template, crate::CoreError> {
    parse_template(&format!(
        "sections:\n  body:\n    type: flow\n    items:\n{item}"
    ))
}

fn first(template: &Template) -> &Item {
    let Body::Flow(flow) = &template.sections.body else { panic!("expected flow") };
    &flow.items[0]
}

#[test]
fn declarations_parse_on_every_carrying_item() {
    let decl = "        bindings:\n          n: { key: 品名 }\n";
    let cases = [
        (
            "text",
            format!("      - type: text\n        text: \"{{n}}\"\n{decl}"),
        ),
        (
            "image",
            format!("      - type: image\n        src: a.png\n{decl}"),
        ),
        (
            "qr_code",
            format!("      - type: qr_code\n        text: \"{{n}}\"\n{decl}"),
        ),
        (
            "list",
            format!("      - type: list\n        data: {{ key: rows }}\n{decl}"),
        ),
        (
            "char_grid",
            format!(
                "      - type: char_grid\n        grid: {{ charsPerLine: 4, lines: 1 }}\n{decl}"
            ),
        ),
    ];
    for (label, yaml) in cases {
        let template = one(&yaml).unwrap_or_else(|e| panic!("{label}: {e}"));
        let bindings = match first(&template) {
            Item::Text(i) => &i.bindings,
            Item::Image(i) => &i.bindings,
            Item::QrCode(i) => &i.bindings,
            Item::List(i) => &i.bindings,
            Item::CharGrid(i) => &i.bindings,
            other => panic!("{label}: unexpected item {other:?}"),
        };
        assert_eq!(bindings.len(), 1, "{label}");
        assert_eq!(bindings["n"].key, "品名", "{label}");
    }
}

#[test]
fn a_declaration_round_trips_every_option() {
    let template = one(concat!(
        "      - type: text\n",
        "        text: \"{n}\"\n",
        "        bindings:\n",
        "          n:\n",
        "            key: order.total\n",
        "            format: currency\n",
        "            placeholder: \"—\"\n",
        "            scope: document\n",
    ))
    .expect("template");
    let Item::Text(text) = first(&template) else { panic!("expected text") };
    let decl = &text.bindings["n"];
    assert_eq!(decl.key, "order.total");
    assert_eq!(decl.format.as_deref(), Some("currency"));
    assert_eq!(decl.placeholder.as_deref(), Some("—"));
    assert_eq!(decl.scope(), BindingScope::Document);
    let yaml = serde_yaml::to_string(first(&template)).expect("yaml");
    for key in ["bindings:", "key:", "format:", "placeholder:", "scope:"] {
        assert!(yaml.contains(key), "{key} missing from: {yaml}");
    }
}

#[test]
fn an_item_without_declarations_serializes_no_bindings_key() {
    let template = one("      - type: text\n        text: plain\n").expect("template");
    // The ITEM node alone: older structs still inject defaults higher up.
    let yaml = serde_yaml::to_string(first(&template)).expect("yaml");
    assert!(!yaml.contains("bindings"), "got: {yaml}");
}

#[test]
fn an_unknown_key_inside_a_declaration_is_a_located_parse_error() {
    let err = one(concat!(
        "      - type: text\n",
        "        text: t\n",
        "        bindings:\n",
        "          n: { key: a, hover: tooltip }\n",
    ))
    .expect_err("hover is not a binding key");
    assert!(err.to_string().contains("hover"), "got: {err}");
}

#[test]
fn a_declaration_without_a_key_is_a_parse_error() {
    let err = one(concat!(
        "      - type: text\n",
        "        text: t\n",
        "        bindings:\n",
        "          n: { format: currency }\n",
    ))
    .expect_err("key is required");
    assert!(err.to_string().contains("key"), "got: {err}");
}

#[test]
fn a_scalar_bindings_value_is_a_parse_error() {
    let err = one("      - type: text\n        text: t\n        bindings: nope\n")
        .expect_err("bindings is a map");
    assert!(!err.to_string().is_empty());
}

#[test]
fn bindings_are_rejected_where_no_string_interpolates() {
    // A shape carries no interpolating string, so the key is a typo.
    let err = one(concat!(
        "      - type: rect\n",
        "        box: { x: 0, y: 0, w: 10, h: 10 }\n",
        "        bindings:\n",
        "          n: { key: a }\n",
    ))
    .expect_err("rect takes no bindings");
    assert!(err.to_string().contains("bindings"), "got: {err}");
    // A span resolves through its OWNING item's map and has none of its own.
    let err = one(concat!(
        "      - type: text\n",
        "        spans:\n",
        "          - text: t\n",
        "            bindings:\n",
        "              n: { key: a }\n",
    ))
    .expect_err("spans take no bindings");
    assert!(err.to_string().contains("bindings"), "got: {err}");
}
