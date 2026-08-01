//! Binding validation: scalar/table keys, formats, params cross-checks.

use super::*;

#[test]
fn valid_template_has_no_diagnostics() {
    let template = tpl(r#"
      - type: text
        data: { key: order.code }
      - type: table
        data: { key: order_items }
        columns:
          - data: { key: name }
            width: 100
"#);
    let params = json!({
        "order": {"code": "A"},
        "order_items": [{"name": "x"}]
    });
    let diags = validate(Some(&defs()), &template, Some(&params));
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
}

#[test]
fn unknown_key_is_error() {
    let template = tpl(r#"
      - type: text
        data: { key: order.ghost }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "unknown_data_key");
}

#[test]
fn missing_params_is_warning() {
    let template = tpl(r#"
      - type: text
        data: { key: order.code }
"#);
    let diags = validate(None, &template, Some(&json!({})));
    assert!(!diags.has_errors());
    assert_eq!(diags.items[0].code, "missing_data");
}

#[test]
fn undeclared_format_is_warning_but_type_override_is_ok() {
    let template = tpl(r#"
      - type: text
        data: { key: order.ordered_at, format: iso }
      - type: text
        text: "{order.code:currency}"
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert_eq!(diags.items.len(), 1);
    assert_eq!(diags.items[0].code, "unknown_format");
}

#[test]
fn table_key_must_be_array() {
    let template = tpl(r#"
      - type: table
        data: { key: order.code }
        columns:
          - data: { key: name }
            width: 100
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "not_an_array");
}

#[test]
fn unknown_column_key_is_error() {
    let template = tpl(r#"
      - type: table
        data: { key: order_items }
        columns:
          - data: { key: ghost }
            width: 100
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors());
    assert!(diags.items[0].message.contains("ghost"));
}

#[test]
fn params_table_value_must_be_array() {
    let template = tpl(r#"
      - type: table
        data: { key: order_items }
        columns:
          - data: { key: name }
            width: 100
"#);
    let params = json!({"order_items": "not-an-array"});
    let diags = validate(None, &template, Some(&params));
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "not_an_array");
}

#[test]
fn absolute_body_and_bands_are_walked() {
    let template = parse_template(
        r#"
sections:
  header:
    items:
      - type: rect
        box: { w: 10, h: 10 }
      - type: page_number
  body:
    type: absolute
    items:
      - type: text
        data: { key: order.ghost }
      - type: line
        from: { x: 0, y: 0 }
        to: { x: 1, y: 1 }
  footer:
    items:
      - type: text
        data: { key: order.code }
"#,
    )
    .expect("template");
    let diags = validate(Some(&defs()), &template, None);
    // Only the absolute-body ghost key errors; rect/line/page_number
    // and the valid footer binding pass.
    assert_eq!(diags.items.len(), 1);
    assert_eq!(diags.items[0].code, "unknown_data_key");
    assert!(diags.items[0]
        .path
        .as_deref()
        .is_some_and(|p| p.contains("sections.body")));
}

#[test]
fn table_key_unknown_in_definitions_is_error() {
    let template = tpl(r#"
      - type: table
        data: { key: ghost_items }
        columns:
          - data: { key: name }
            width: 100
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "unknown_data_key");
    assert!(diags.items[0].message.contains("ghost_items"));
}

#[test]
fn table_params_missing_is_warning() {
    let template = tpl(r#"
      - type: table
        data: { key: order_items }
        columns:
          - data: { key: name }
            width: 100
"#);
    let diags = validate(None, &template, Some(&json!({})));
    assert!(!diags.has_errors());
    assert_eq!(diags.items[0].code, "missing_data");
}

#[test]
fn image_binding_keys_are_checked() {
    let template = tpl(r#"
      - type: image
        box: { w: 10, h: 10 }
        data: { key: order.ghost }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "unknown_data_key");

    let template = tpl(r#"
      - type: image
        box: { w: 10, h: 10 }
        data: { key: order.code }
"#);
    let diags = validate(Some(&defs()), &template, Some(&json!({})));
    assert!(!diags.has_errors());
    assert_eq!(diags.items[0].code, "missing_data");
}

#[test]
fn image_items_need_exactly_one_source() {
    let template = parse_template(
        r#"
sections:
  header:
    items:
      - type: image
        box: { x: 0, y: 0, w: 10, h: 10 }
  body:
    type: absolute
    items:
      - type: image
        box: { x: 0, y: 0, w: 10, h: 10 }
        src: logo.png
        data: { key: order.code }
  footer:
    items:
      - type: image
        box: { x: 0, y: 0, w: 10, h: 10 }
        src: logo.png
"#,
    )
    .expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.has_errors());
    let codes: Vec<&str> = diags.items.iter().map(|d| d.code.as_str()).collect();
    assert!(codes.contains(&"image_source_missing"));
    assert!(codes.contains(&"image_source_conflict"));
    // The footer image is fine: exactly 2 structural errors.
    assert_eq!(diags.items.len(), 2);
    assert!(diags.items[0]
        .path
        .as_deref()
        .is_some_and(|p| p.contains("header")));
}

#[test]
fn link_url_keys_are_checked_like_text() {
    // LK1: `{key}` segments in a link URL bind exactly like static text —
    // unknown keys error on the text item, its spans, and images alike.
    let template = tpl(r#"
      - type: text
        text: shop
        link: { url: "https://example.com/{order.ghost}" }
      - type: text
        spans:
          - text: terms
            link: { url: "{order.phantom}" }
      - type: image
        box: { x: 0, y: 0, w: 10, h: 10 }
        src: logo.png
        link: { url: "{order.wraith}" }
"#);
    let diags = validate(Some(&defs()), &template, None);
    let ghosts: Vec<&str> = diags
        .items
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .map(|d| d.message.as_str())
        .collect();
    assert_eq!(ghosts.len(), 3, "{diags:?}");
    assert!(ghosts[1].contains("order.phantom"));
    assert!(diags.items[1]
        .path
        .as_deref()
        .is_some_and(|p| p.contains("spans[0]")));
}

#[test]
fn link_url_missing_params_is_warning() {
    let template = tpl(r#"
      - type: text
        text: shop
        link: { url: "https://example.com/{order.code}" }
"#);
    let diags = validate(None, &template, Some(&json!({})));
    assert!(!diags.has_errors());
    assert_eq!(diags.items[0].code, "missing_data");
}

#[test]
fn fit_on_a_non_image_column_warns_ignored_column_key() {
    let template = tpl(r#"
      - type: table
        data: { key: order_items }
        columns:
          - data: { key: name }
            fit: cover
            width: 100
"#);
    let diags = validate(None, &template, None);
    assert!(
        diags.iter().any(|d| d.code == "ignored_column_key"),
        "{diags:?}"
    );
    // On an image column the key is honored — no warning.
    let template = tpl(r#"
      - type: table
        data: { key: order_items }
        columns:
          - data: { key: photo }
            type: image
            fit: cover
            width: 100
"#);
    let diags = validate(None, &template, None);
    assert!(
        !diags.iter().any(|d| d.code == "ignored_column_key"),
        "{diags:?}"
    );
}
