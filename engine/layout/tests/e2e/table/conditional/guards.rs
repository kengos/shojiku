//! What a conditional entry does with data it cannot act on: the two
//! warnings, the silences that keep a blank form quiet, and the hostile
//! shapes (wrong types, over-cap lists, nested keys).

use super::*;

/// The entry list a cap test needs: `count` entries, each matching, each
/// setting a distinguishable property.
fn many_entries(count: usize) -> String {
    let mut yaml = String::from("          conditionalStyles:\n");
    for i in 0..count {
        yaml.push_str("            - when: { key: kind, equals: heading }\n");
        // Every entry sets the SAME property so the last applied one is
        // observable, plus its own index as a color channel.
        let blue = i as f64 / 100.0;
        yaml.push_str(&format!(
            "              style: {{ backgroundColor: \"#0000{:02x}\" }}\n",
            (blue * 100.0) as u8
        ));
    }
    yaml
}

#[test]
fn a_type_mismatched_equals_warns_and_does_not_apply() {
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: 2 }\n              style: { textAlign: center }\n",
        json!([{ "label": "AAA", "kind": "2" }]),
    );
    assert_left_aligned(&doc.pages[0], "AAA");
    let warns: Vec<_> = diags
        .items
        .iter()
        .filter(|d| d.code == "row_condition_type_mismatch")
        .collect();
    assert_eq!(warns.len(), 1, "diags: {diags:?}");
    assert!(warns[0].message.contains("kind"));
    assert_eq!(
        warns[0].path.as_deref(),
        Some("sections.body.items[0].row.conditionalStyles[0]")
    );
}

#[test]
fn an_equals_less_entry_on_a_non_boolean_value_warns_and_does_not_apply() {
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: flagged }\n              style: { textAlign: center }\n",
        json!([{ "label": "AAA", "flagged": "yes" }]),
    );
    assert_left_aligned(&doc.pages[0], "AAA");
    let warns: Vec<_> = diags
        .items
        .iter()
        .filter(|d| d.code == "row_condition_value_not_bool")
        .collect();
    assert_eq!(warns.len(), 1, "diags: {diags:?}");
    assert!(warns[0].message.contains("flagged"));
}

#[test]
fn a_warning_names_the_key_but_never_echoes_the_row_value() {
    let (_doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: 2 }\n              style: { textAlign: center }\n",
        json!([{ "label": "AAA", "kind": "SECRET-VALUE" }]),
    );
    let joined: String = diags.items.iter().map(|d| d.message.clone()).collect();
    assert!(joined.contains("kind"), "the key names the problem");
    assert!(
        !joined.contains("SECRET-VALUE"),
        "row values must not be echoed: {joined}"
    );
}

#[test]
fn a_missing_key_is_silent() {
    // The blank-form case: no `kind` at all in any row.
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { textAlign: center }\n",
        json!([{ "label": "AAA" }, { "label": "BBB" }]),
    );
    assert!(diags.is_empty(), "a blank form must stay quiet: {diags:?}");
    assert_left_aligned(&doc.pages[0], "AAA");
}

#[test]
fn a_null_value_warns_like_a_type_mismatch() {
    let (_doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { textAlign: center }\n",
        json!([{ "label": "AAA", "kind": null }]),
    );
    assert_eq!(
        diags
            .items
            .iter()
            .filter(|d| d.code == "row_condition_type_mismatch")
            .count(),
        1,
        "diags: {diags:?}"
    );
}

#[test]
fn an_object_value_warns_like_a_type_mismatch() {
    let (_doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { textAlign: center }\n",
        json!([{ "label": "AAA", "kind": { "nested": 1 } }]),
    );
    assert_eq!(
        diags
            .items
            .iter()
            .filter(|d| d.code == "row_condition_type_mismatch")
            .count(),
        1,
        "diags: {diags:?}"
    );
}

#[test]
fn one_warning_survives_a_long_row_array() {
    // The row count is params-driven: 50 rows must not build 50 copies
    // of the same warning.
    let rows: Vec<Value> = (1..=50)
        .map(|i| json!({ "label": format!("r{i}"), "kind": 7 }))
        .collect();
    let (_doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { textAlign: center }\n",
        json!(rows),
    );
    assert_eq!(
        diags
            .items
            .iter()
            .filter(|d| d.code == "row_condition_type_mismatch")
            .count(),
        1,
        "diags: {diags:?}"
    );
}

#[test]
fn the_sixteenth_entry_applies_and_the_seventeenth_is_ignored() {
    // At the cap's admitted maximum the entry still acts; past it the
    // style must be ABSENT from the output, not merely warned about.
    let (doc, diags) = conditional_table(
        &many_entries(17),
        json!([{ "label": "AAA", "kind": "heading" }]),
    );
    assert!(
        diags.is_empty(),
        "layout does not warn about the cap: {diags:?}"
    );
    // Entry 15 (the 16th) wins; entry 16 (the 17th) never runs.
    let sixteenth = (0.0, 0.0, 15.0 / 255.0);
    let seventeenth = (0.0, 0.0, 16.0 / 255.0);
    let fills = row_fills(&doc.pages[0]);
    assert_eq!(fills.len(), 1);
    assert!(
        (fills[0].2 - sixteenth.2).abs() < 1e-6,
        "the 16th entry should be the last applied; got {fills:?}"
    );
    assert!(
        (fills[0].2 - seventeenth.2).abs() > 1e-6,
        "the 17th entry must not apply"
    );
}

#[test]
fn a_dotted_nested_key_resolves_against_the_row() {
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: meta.kind, equals: heading }\n              style: { textAlign: center }\n",
        json!([
            { "label": "AAA", "meta": { "kind": "heading" } },
            { "label": "BBB", "meta": { "kind": "plain" } },
        ]),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_centered(&doc.pages[0], "AAA");
    assert_left_aligned(&doc.pages[0], "BBB");
}

#[test]
fn a_blank_form_renders_the_same_geometry_as_an_unconditioned_table() {
    // The blank↔filled invariant: adding conditional entries must not
    // move anything when no row matches.
    let entries =
        "          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { textAlign: center, backgroundColor: \"#00ff00\" }\n";
    let blank = json!([{ "label": "AAA" }, { "label": "BBB" }]);
    let (with, diags_with) = conditional_table(entries, blank.clone());
    let (without, diags_without) = conditional_table("", blank);
    assert!(diags_with.is_empty() && diags_without.is_empty());
    assert_eq!(
        line_geom(&with.pages[0], "AAA"),
        line_geom(&without.pages[0], "AAA")
    );
    assert_eq!(row_fills(&with.pages[0]), row_fills(&without.pages[0]));
}
