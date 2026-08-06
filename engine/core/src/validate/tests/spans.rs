//! Validation of rich-text `spans`: content exclusivity, caps,
//! inert style keys, bindings, and styleName references.

use super::*;

#[test]
fn span_conflicts_and_empty_span_warn() {
    let template = tpl(r#"
      - type: text
        text: shadowed
        spans:
          - text: a
            data: { key: order.code }
          - style: { fontWeight: bold }
"#);
    let diags = validate(None, &template, None);
    let conflicts: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "span_content_conflict")
        .collect();
    // Item-level (`text` beside `spans`) and span-level (`text`+`data`).
    assert_eq!(conflicts.len(), 2);
    assert!(conflicts[0]
        .path
        .as_deref()
        .is_some_and(|p| p.ends_with("items[0]")));
    assert!(conflicts[1]
        .path
        .as_deref()
        .is_some_and(|p| p.ends_with(".spans[0]")));
    assert!(diags
        .iter()
        .any(|d| d.code == "empty_span"
            && d.path.as_deref().is_some_and(|p| p.ends_with(".spans[1]"))));
    assert!(!diags.has_errors());
}

#[test]
fn too_many_spans_warns_once() {
    let mut spans = String::new();
    for _ in 0..=MAX_SPANS {
        spans.push_str("          - text: x\n");
    }
    let template = tpl(&format!("      - type: text\n        spans:\n{spans}"));
    let diags = validate(None, &template, None);
    assert_eq!(
        diags.iter().filter(|d| d.code == "too_many_spans").count(),
        1
    );
}

#[test]
fn inert_inline_span_style_keys_warn_by_name() {
    let template = tpl(r#"
      - type: text
        spans:
          - text: ok
            style: { fontWeight: bold, letterSpacing: 1, textCombineUpright: all }
          - text: boxy
            style: { verticalAlign: middle, opacity: 0.5, fontSize: 12 }
"#);
    let diags = validate(None, &template, None);
    let ignored: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "ignored_span_style")
        .collect();
    // Only the span authoring block-level keys warns, naming them.
    assert_eq!(ignored.len(), 1);
    assert!(ignored[0].message.contains("verticalAlign"));
    assert!(ignored[0].message.contains("opacity"));
    assert!(!ignored[0].message.contains("fontSize"));
    // 縦中横 is a per-span key now (the span cascade honors it).
    assert!(!ignored[0].message.contains("textCombineUpright"));
}

#[test]
fn span_bindings_are_checked_scalar_and_params() {
    let template = tpl(r#"
      - type: text
        spans:
          - data: { key: order.ghost }
          - text: "no. {order.phantom}"
"#);
    let diags = validate(Some(&defs()), &template, None);
    let keys: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .collect();
    assert_eq!(keys.len(), 2);
    assert!(keys[0]
        .path
        .as_deref()
        .is_some_and(|p| p.ends_with(".spans[0]")));
    // Params-side: a declared key missing from params warns.
    let ok = tpl(r#"
      - type: text
        spans:
          - data: { key: order.code }
"#);
    let diags = validate(Some(&defs()), &ok, Some(&json!({})));
    assert!(diags.iter().any(|d| d.code == "missing_data"));
}

#[test]
fn span_bindings_are_element_scoped_in_repeat_cells() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        grid: { columns: 2, rows: 2 }
        cell:
          items:
            - type: text
              spans:
                - data: { key: name }
                - text: "x{ghost}"
"#);
    let diags = validate(Some(&defs()), &template, None);
    let bad: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .collect();
    assert_eq!(bad.len(), 1);
    assert!(bad[0]
        .path
        .as_deref()
        .is_some_and(|p| p.contains(".cell.items[0].spans[1]")));
}

#[test]
fn span_style_names_are_checked_against_the_registry() {
    let template = parse_template(
        r#"
styles:
  muted: { color: '#666666' }
sections:
  body:
    type: flow
    items:
      - type: text
        spans:
          - text: ok
            styleNames: [muted]
          - text: bad
            styleNames: [ghost]
"#,
    )
    .expect("template");
    let diags = validate(None, &template, None);
    let undefined: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "undefined_style_name")
        .collect();
    assert_eq!(undefined.len(), 1);
    assert!(undefined[0]
        .path
        .as_deref()
        .is_some_and(|p| p.ends_with(".spans[1]")));
}
