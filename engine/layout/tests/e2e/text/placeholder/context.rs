//! `placeholder` across the text-bearing contexts that share the one
//! `resolve_binding` choke point — the field-level default (covering
//! interpolation segments), the placement-over-field override, spans,
//! table columns — plus the hostile-input guards.

use crate::common::*;

/// Definitions with a field-level placeholder on a scalar `birth_date`
/// and an array group `rows` whose `label` field also has one.
const DEFS: &str = r#"
type: object
properties:
  birth_date:
    type: string
    format: date
    placeholder: "　年　月　日"
  rows:
    type: array
    items:
      type: object
      properties:
        label:
          type: string
          placeholder: "（空欄）"
"#;

#[test]
fn field_placeholder_covers_interpolation_segment() {
    // The inline `{birth_date}` segment carries no placeholder of its own;
    // the field's covers it — the blank-form 履歴書 inline case.
    let (doc, diags) = run_with_defs(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 100 }
    items:
      - type: text
        box: { w: 300, h: 20 }
        text: "生年月日: {birth_date}"
"#,
        DEFS,
        json!({}),
    );
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "生年月日: 　年　月　日");
}

#[test]
fn placement_placeholder_overrides_field() {
    // Both present: the placement (binding) placeholder wins.
    let (doc, diags) = run_with_defs(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 100 }
    items:
      - type: text
        box: { w: 300, h: 20 }
        data: { key: birth_date, placeholder: "未記入" }
"#,
        DEFS,
        json!({}),
    );
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "未記入");
}

#[test]
fn span_binding_placeholder_draws_and_is_clean() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 100 }
    items:
      - type: text
        box: { w: 300, h: 20 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10 }
        spans:
          - text: "氏名: "
          - data: { key: full_name, placeholder: "（未記入）" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    let all: String = text_blocks(&doc.pages[0])[0]
        .lines
        .iter()
        .map(|l| l.text.clone())
        .collect();
    assert_eq!(all, "氏名: （未記入）");
}

#[test]
fn table_column_binding_placeholder_per_row() {
    // A row with a blank cell draws the placeholder; a filled row draws its
    // value — the placeholder is applied per row through the same choke
    // point (mask prevention scoped to each element).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - data: { key: label, placeholder: "（空欄）" }
            width: 200
"#,
        json!({ "rows": [{ "label": "実データ" }, { "label": "" }] }),
    );
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    let text = all_text(&doc.pages[0]);
    assert!(text.contains("実データ"), "got: {text}");
    assert!(text.contains("（空欄）"), "got: {text}");
}

#[test]
fn qr_code_binding_placeholder_is_clean() {
    // `qr_code` resolves its content through the same choke point, so a
    // blank value + placeholder encodes the placeholder text with no
    // diagnostic (a blank QR field on a fillable form).
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: qr_code
        box: { w: 60, h: 60 }
        data: { key: token, placeholder: "PENDING" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "expected clean: {diags:?}");
}

#[test]
fn list_entry_field_placeholder_covers_blank_entry() {
    // A `list`'s per-entry `{key}` template resolves against the entry
    // object through the choke point; a field-level placeholder on the
    // array group covers a blank entry value.
    let (doc, diags) = run_with_defs(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: list
        box: { w: 300, h: 100 }
        data: { key: rows }
        text: "・{label}"
        style: { fontSize: 10, lineHeight: 1.2 }
"#,
        DEFS,
        json!({ "rows": [{ "label": "実データ" }, { "label": "" }] }),
    );
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    let text = all_text(&doc.pages[0]);
    assert!(text.contains("実データ"), "got: {text}");
    assert!(text.contains("（空欄）"), "got: {text}");
}

#[test]
fn very_long_placeholder_does_not_panic() {
    // Hostile authored placeholder: a very long run drawn through the
    // normal text pipeline. Placeholder text is DRAWN, never echoed into a
    // diagnostic, so the only risk is a layout panic/hang at scale — there
    // is none, and the blank stays covered.
    let long = "あ".repeat(2000);
    let (_doc, diags) = run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: text
        box: {{ w: 300, h: 300 }}
        data: {{ key: x, placeholder: "{long}" }}
"#
        ),
        json!({}),
    );
    // No format_error/missing_data: the placeholder covered the blank.
    assert!(
        !diags.iter().any(|d| d.code == "missing_data"),
        "placeholder should cover: {diags:?}"
    );
}
