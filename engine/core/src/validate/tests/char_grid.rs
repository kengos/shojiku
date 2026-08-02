//! char_grid validation: bindings, style names, box-key placement.

use super::*;

#[test]
fn char_grid_binds_like_text() {
    let template = tpl(r#"
      - type: char_grid
        data: { key: order.code }
        grid: { charsPerLine: 4, lines: 1 }
      - type: char_grid
        text: "番号{order.code}"
        grid: { charsPerLine: 8, lines: 1 }
"#);
    let params = json!({"order": {"code": "A1"}});
    let diags = validate(Some(&defs()), &template, Some(&params));
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
}

#[test]
fn char_grid_unknown_keys_are_errors() {
    let template = tpl(r#"
      - type: char_grid
        data: { key: order.ghost }
        grid: { charsPerLine: 4, lines: 1 }
      - type: char_grid
        text: "{order.phantom}"
        grid: { charsPerLine: 4, lines: 1 }
"#);
    let diags = validate(Some(&defs()), &template, None);
    let codes: Vec<_> = diags.iter().map(|d| d.code.as_str()).collect();
    assert_eq!(codes, vec!["unknown_data_key", "unknown_data_key"]);
}

#[test]
fn char_grid_cell_bindings_are_element_scoped() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        grid: { columns: 2, rows: 2 }
        cell:
          items:
            - type: char_grid
              data: { key: name }
              grid: { charsPerLine: 4, lines: 1 }
            - type: char_grid
              text: "数{quantity}"
              grid: { charsPerLine: 4, lines: 1 }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
}

#[test]
fn char_grid_cell_unknown_field_is_an_error() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        grid: { columns: 2, rows: 2 }
        cell:
          items:
            - type: char_grid
              data: { key: ghost }
              grid: { charsPerLine: 4, lines: 1 }
            - type: char_grid
              text: "{phantom}"
              grid: { charsPerLine: 4, lines: 1 }
"#);
    let diags = validate(Some(&defs()), &template, None);
    let hits = diags
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .count();
    assert_eq!(hits, 2);
}

#[test]
fn char_grid_style_names_are_checked() {
    let template = tpl(r#"
      - type: char_grid
        text: あ
        grid: { charsPerLine: 1, lines: 1 }
        styleNames: [ghost]
"#);
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "undefined_style_name"));
}

#[test]
fn char_grid_box_is_a_leaf_for_layout_keys() {
    let template = tpl(r#"
      - type: char_grid
        text: あ
        grid: { charsPerLine: 1, lines: 1 }
        box: { direction: column }
"#);
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "layout_key_on_leaf"));
}
