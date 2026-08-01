//! `enum` display labels end to end: every carrier that resolves a
//! binding renders the declared words, and `format: value` is the escape
//! back to the machine value params actually carry.

use crate::common::*;

/// A schema whose scalar AND row-relative status fields both declare one
/// labeled member beside a bare one — partial labeling, as authored.
fn labeled_defs() -> Catalog {
    let defs = parse_definitions(
        r#"
type: object
properties:
  status:
    type: string
    enum:
      - { value: backorder, label: （入荷待ち） }
      - arrived
  rows:
    type: array
    items:
      type: object
      properties:
        state:
          type: string
          enum:
            - { value: open, label: 受付中 }
            - { value: done, label: 完了 }
"#,
    )
    .expect("defs");
    Catalog::from_definitions(&defs)
}

fn run_labeled(body: &str, params: Value) -> (LayoutDocument, Diagnostics) {
    let template = parse_template(&format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
{body}"#
    ))
    .expect("template");
    let catalog = labeled_defs();
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: Some(&catalog),
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    (out.document, out.diagnostics)
}

#[test]
fn a_text_item_renders_the_label_through_both_wire_forms() {
    // The two ways a text item names a field — an interpolation segment
    // and a whole-item `data` binding — resolve the same label.
    let (doc, diags) = run_labeled(
        r#"      - type: text
        text: "状態は{status}です"
      - type: text
        data: { key: status }
"#,
        json!({ "status": "backorder" }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let text = all_text(&doc.pages[0]);
    assert!(text.contains("状態は（入荷待ち）です"), "got: {text}");
    assert_eq!(text.matches("（入荷待ち）").count(), 2, "got: {text}");
}

#[test]
fn the_value_pick_renders_the_machine_value_through_both_wire_forms() {
    let (doc, diags) = run_labeled(
        r#"      - type: text
        text: "コード{status:value}"
      - type: text
        data: { key: status, format: value }
"#,
        json!({ "status": "backorder" }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let text = all_text(&doc.pages[0]);
    assert!(text.contains("コードbackorder"), "got: {text}");
    assert_eq!(text.matches("backorder").count(), 2, "got: {text}");
    assert!(!text.contains("入荷待ち"), "got: {text}");
}

#[test]
fn an_unlabeled_member_renders_its_value() {
    let (doc, diags) = run_labeled(
        r#"      - type: text
        data: { key: status }
"#,
        json!({ "status": "arrived" }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert!(all_text(&doc.pages[0]).contains("arrived"));
}

#[test]
fn a_table_column_renders_row_relative_labels() {
    // The row-relative spec is the same `FieldSpec`, so a column needs no
    // wiring of its own — and its own `format: value` still escapes.
    let (doc, diags) = run_labeled(
        r#"      - type: table
        data: { key: rows }
        columns:
          - data: { key: state }
            width: 120
          - data: { key: state, format: value }
            width: 120
"#,
        json!({ "rows": [{ "state": "open" }, { "state": "done" }] }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let text = all_text(&doc.pages[0]);
    for expected in ["受付中", "完了", "open", "done"] {
        assert!(text.contains(expected), "missing {expected} in: {text}");
    }
}

#[test]
fn a_list_entry_renders_labels_through_its_entry_template() {
    // A list interpolates against the ENTRY, so its segments resolve the
    // row-relative spec — the third carrier.
    let (doc, diags) = run_labeled(
        r#"      - type: list
        box: { w: 300, h: 60 }
        data: { key: rows }
        text: "{state} / {state:value}"
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "rows": [{ "state": "open" }, { "state": "done" }] }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(
        crate::list::lines_of(&doc.pages[0]),
        vec!["受付中 / open", "完了 / done"]
    );
}

#[test]
fn an_empty_label_renders_empty_without_firing_the_placeholder() {
    // An empty-string label is the authorable "print nothing for this
    // member". The VALUE is present and non-blank, so the binding
    // placeholder must NOT fire — blankness is judged on the params
    // value, before any label applies.
    let defs = parse_definitions(
        r#"
type: object
properties:
  status:
    type: string
    enum:
      - { value: hidden, label: "" }
"#,
    )
    .expect("defs");
    let catalog = Catalog::from_definitions(&defs);
    let template = parse_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        data: { key: status, placeholder: "—" }
"#,
    )
    .expect("template");
    let params = json!({ "status": "hidden" });
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: Some(&catalog),
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    assert!(out.diagnostics.is_empty(), "got: {:?}", out.diagnostics);
    let text = all_text(&out.document.pages[0]);
    assert!(!text.contains('—'), "placeholder fired: {text}");
    assert!(!text.contains("hidden"), "raw value leaked: {text}");
}

#[test]
fn an_unknown_variant_on_a_labeled_field_warns_and_keeps_the_label() {
    let (doc, diags) = run_labeled(
        r#"      - type: text
        data: { key: status, format: wareki }
"#,
        json!({ "status": "backorder" }),
    );
    let codes: Vec<&str> = diags.iter().map(|d| d.code.as_str()).collect();
    assert_eq!(codes, vec!["unknown_format_variant"], "got: {codes:?}");
    assert!(all_text(&doc.pages[0]).contains("（入荷待ち）"));
}

#[test]
fn a_field_declaring_no_labels_still_ignores_a_variant_silently() {
    // Pinned as it has always behaved: the text arm has no variants of
    // its own, so an authored pick on a plain text field stays inert.
    // Labels must not turn that silence into a warning for everyone else.
    let defs =
        parse_definitions("type: object\nproperties:\n  note:\n    type: string\n").expect("defs");
    let catalog = Catalog::from_definitions(&defs);
    let template = parse_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        data: { key: note, format: wareki }
"#,
    )
    .expect("template");
    let params = json!({ "note": "そのまま" });
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: Some(&catalog),
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    assert!(out.diagnostics.is_empty(), "got: {:?}", out.diagnostics);
    assert!(all_text(&out.document.pages[0]).contains("そのまま"));
}

/// The module rects a one-QR page draws — the only observable form of a
/// QR's encoded content, so two runs are compared through it.
fn qr_modules(doc: &LayoutDocument) -> Vec<(f64, f64)> {
    crate::qr::qr_rects(&doc.pages[0])
        .iter()
        .map(|r| (r.x, r.y))
        .collect()
}

fn qr_page(item_body: &str, params: Value) -> LayoutDocument {
    let (doc, diags) = run_labeled(item_body, params);
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    doc
}

#[test]
fn a_qr_encodes_the_label_and_the_value_pick_encodes_the_raw_value() {
    // A QR has always encoded the FORMATTED value (it shares the text
    // item's resolution): a currency field encodes `¥5,000`, a `wareki`
    // date encodes the era string. A label is one more format, so the
    // default encodes the declared words and `format: value` is the
    // escape — proved against literal-text controls, since the encoded
    // string is observable only as its modules.
    const BOX: &str = "box: { w: 80, h: 80 }";
    let bound = qr_page(
        &format!("      - type: qr_code\n        {BOX}\n        data: {{ key: status }}\n"),
        json!({ "status": "backorder" }),
    );
    let label_literal = qr_page(
        &format!("      - type: qr_code\n        {BOX}\n        text: \"（入荷待ち）\"\n"),
        json!({ "status": "backorder" }),
    );
    assert_eq!(qr_modules(&bound), qr_modules(&label_literal));

    let raw = qr_page(
        &format!(
            "      - type: qr_code\n        {BOX}\n        data: {{ key: status, format: value }}\n"
        ),
        json!({ "status": "backorder" }),
    );
    let raw_literal = qr_page(
        &format!("      - type: qr_code\n        {BOX}\n        text: backorder\n"),
        json!({ "status": "backorder" }),
    );
    assert_eq!(qr_modules(&raw), qr_modules(&raw_literal));
    assert_ne!(
        qr_modules(&bound),
        qr_modules(&raw),
        "the two picks must encode different strings"
    );
}
