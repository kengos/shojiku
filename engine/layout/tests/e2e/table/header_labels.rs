//! Header labels are text like any other: column labels and
//! `headerGroups` labels interpolate `{key}` against top-level params, so
//! one template can print its chrome in whichever language the params are
//! written in instead of pinning one into the YAML.

use crate::common::*;

/// Every drawn string on page 1. The labels under test are distinctive
/// enough that membership is the whole assertion — and an un-resolved
/// label would show up here as the literal `{labels.…}`.
fn header_texts(doc: &LayoutDocument) -> Vec<String> {
    text_blocks(&doc.pages[0])
        .iter()
        .filter_map(|b| b.lines.first().map(|l| l.text.clone()))
        .collect()
}

const TEMPLATE: &str = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 500 }
    items:
      - type: table
        data: { key: items }
        columns:
          - { label: "{labels.name}", data: { key: name }, width: 200 }
          - { label: "{labels.qty}", data: { key: qty }, width: 200 }
"#;

#[test]
fn column_labels_interpolate_against_top_level_params() {
    let (doc, diags) = run(
        TEMPLATE,
        json!({
            "labels": { "name": "材料", "qty": "分量" },
            "items": [{ "name": "row-a", "qty": "1" }],
        }),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let texts = header_texts(&doc);
    assert!(
        texts.contains(&"材料".to_string()) && texts.contains(&"分量".to_string()),
        "header labels not interpolated: {texts:?}"
    );
}

#[test]
fn the_same_template_prints_a_second_language_from_params_alone() {
    // The point of the feature: only the params changed.
    let (doc, diags) = run(
        TEMPLATE,
        json!({
            "labels": { "name": "Ingredient", "qty": "Amount" },
            "items": [{ "name": "row-a", "qty": "1" }],
        }),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let texts = header_texts(&doc);
    assert!(
        texts.contains(&"Ingredient".to_string()) && texts.contains(&"Amount".to_string()),
        "header labels not interpolated: {texts:?}"
    );
}

#[test]
fn a_label_without_interpolation_is_drawn_verbatim() {
    // Every pre-existing template takes this path, so it must be identity.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 500 }
    items:
      - type: table
        data: { key: items }
        columns:
          - { label: "Plain label", data: { key: name }, width: 400 }
"#,
        json!({ "items": [{ "name": "row-a" }] }),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(header_texts(&doc).contains(&"Plain label".to_string()));
}

#[test]
fn an_unlabeled_column_beside_labeled_ones_stays_blank() {
    // The checkbox-column shape: no heading of its own, while its
    // neighbours have one, so the header row still renders.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 500 }
    items:
      - type: table
        data: { key: items }
        columns:
          - { data: { key: tick }, width: 40 }
          - { label: "{labels.name}", data: { key: name }, width: 360 }
"#,
        json!({
            "labels": { "name": "材料" },
            "items": [{ "tick": "", "name": "row-a" }],
        }),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let texts = header_texts(&doc);
    assert!(texts.contains(&"材料".to_string()), "{texts:?}");
}

#[test]
fn header_group_labels_interpolate_too() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 500 }
    items:
      - type: table
        data: { key: items }
        headerGroups:
          - { label: "{labels.group}", span: 2 }
        columns:
          - { label: a, data: { key: name }, width: 200 }
          - { label: b, data: { key: qty }, width: 200 }
"#,
        json!({
            "labels": { "group": "まとめ" },
            "items": [{ "name": "row-a", "qty": "1" }],
        }),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let texts = header_texts(&doc);
    assert!(
        texts.contains(&"まとめ".to_string()),
        "group label not interpolated: {texts:?}"
    );
}
