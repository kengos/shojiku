//! `repeat` validation: array groups, cell bindings, nesting, styles.

use super::*;

#[test]
fn repeat_valid_array_and_cell_bindings_pass() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: text
              data: { key: name }
            - type: text
              text: "{quantity}点"
"#);
    let params = json!({"order_items": [{"name": "x", "quantity": 1}]});
    let diags = validate(Some(&defs()), &template, Some(&params));
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
}

#[test]
fn repeat_data_key_unknown_in_definitions_is_error() {
    let template = tpl(r#"
      - type: repeat
        data: { key: ghost_items }
        cell:
          items: []
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "unknown_data_key");
    assert!(diags.items[0].message.contains("ghost_items"));
}

#[test]
fn repeat_data_key_must_be_an_array_group() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order.code }
        cell:
          items: []
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.iter().any(|d| d.code == "not_an_array"));
}

#[test]
fn repeat_cell_key_not_in_array_group_is_error() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: text
              data: { key: ghost }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags
        .iter()
        .any(|d| d.message.contains("ghost") && d.message.contains("order_items")));
}

#[test]
fn repeat_cell_interpolation_key_is_checked() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: text
              text: "count: {ghost}"
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags
        .iter()
        .any(|d| d.code == "unknown_data_key" && d.message.contains("ghost")));
}

#[test]
fn repeat_cell_container_bindings_are_checked_recursively() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: container
              items:
                - type: text
                  data: { key: ghost }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags
        .iter()
        .any(|d| d.code == "unknown_data_key" && d.message.contains("ghost")));
    assert!(diags.iter().any(|d| d
        .path
        .as_deref()
        .is_some_and(|p| p.contains(".cell.items[0].items[0]"))));
}

#[test]
fn repeat_params_missing_is_warning() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items: []
"#);
    let diags = validate(None, &template, Some(&json!({})));
    assert!(!diags.has_errors());
    assert_eq!(diags.items[0].code, "missing_data");
}

#[test]
fn repeat_params_value_must_be_array() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items: []
"#);
    let params = json!({"order_items": "nope"});
    let diags = validate(None, &template, Some(&params));
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "not_an_array");
}

#[test]
fn repeat_nested_in_container_and_cell_are_collected() {
    // A repeat inside a container, and a repeat nested inside a cell, are
    // both found and binding-checked.
    let template = tpl(r#"
      - type: container
        items:
          - type: repeat
            data: { key: order_items }
            cell:
              items:
                - type: text
                  data: { key: ghost }
                - type: repeat
                  data: { key: order_items }
                  cell:
                    items:
                      - type: text
                        data: { key: alsoghost }
"#);
    let diags = validate(Some(&defs()), &template, None);
    let msgs: Vec<&str> = diags.iter().map(|d| d.message.as_str()).collect();
    assert!(msgs.iter().any(|m| m.contains("ghost")), "outer: {diags:?}");
    assert!(
        msgs.iter().any(|m| m.contains("alsoghost")),
        "nested repeat: {diags:?}"
    );
}

#[test]
fn repeat_cell_counts_toward_container_depth_cap() {
    // The cell is a depth-1 box; a chain of MAX_CONTAINER_DEPTH containers
    // inside it pushes past the cap.
    let mut cell_items = String::new();
    let mut indent = String::from("            ");
    for _ in 0..MAX_CONTAINER_DEPTH {
        cell_items.push_str(&format!("{indent}- type: container\n{indent}  items:\n"));
        indent.push_str("    ");
    }
    cell_items.push_str(&format!("{indent}- type: text\n{indent}  text: deep\n"));
    let yaml = format!(
        "sections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    \
             items:\n      - type: repeat\n        data: {{ key: order_items }}\n        \
             cell:\n          items:\n{cell_items}"
    );
    let template = parse_template(&yaml).expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "container_depth_exceeded"));
}

#[test]
fn repeat_cell_style_names_are_validated() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          styleNames: [ghostCell]
          items:
            - type: text
              data: { key: name }
              styleNames: [ghostText]
"#);
    let diags = validate(None, &template, None);
    let paths: Vec<&str> = diags
        .iter()
        .filter(|d| d.code == "undefined_style_name")
        .map(|d| d.path.as_deref().unwrap_or(""))
        .collect();
    assert_eq!(paths.len(), 2, "{diags:?}");
    assert!(paths.iter().any(|p| p.ends_with(".cell")));
    assert!(paths.iter().any(|p| p.contains(".cell.items[0]")));
}

#[test]
fn qr_code_cell_bindings_are_array_scoped() {
    // A qr_code inside a repeat cell binds like a text item: `data:` and
    // `{{key}}` interpolation must be declared fields of the group.
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: qr_code
              box: { w: 40, h: 40 }
              data: { key: ghost_token }
            - type: qr_code
              box: { w: 40, h: 40 }
              text: "https://x.example/{ghost_id}"
"#);
    let diags = validate(Some(&defs()), &template, None);
    let unknown: Vec<&str> = diags
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .map(|d| d.message.as_str())
        .collect();
    assert_eq!(unknown.len(), 2, "{diags:?}");
    assert!(unknown[0].contains("ghost_token"));
    assert!(unknown[1].contains("ghost_id"));
}

#[test]
fn list_cell_array_must_be_a_declared_group_field() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: list
              data: { key: ghost_lines }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(
        diags
            .iter()
            .any(|d| d.code == "unknown_data_key" && d.message.contains("ghost_lines")),
        "{diags:?}"
    );
}

#[test]
fn repeat_cell_link_url_keys_are_element_scoped() {
    // LK1: a link URL inside a cell binds against the array group, like
    // cell text — on the text item, its spans, and images alike.
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: text
              text: open
              link: { url: "https://example.com/{name}" }
            - type: text
              spans:
                - text: see
                  link: { url: "{ghost}" }
            - type: image
              box: { x: 0, y: 0, w: 10, h: 10 }
              src: logo.png
              link: { url: "{wraith}" }
"#);
    let diags = validate(Some(&defs()), &template, None);
    let bad: Vec<&str> = diags
        .items
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .map(|d| d.message.as_str())
        .collect();
    assert_eq!(bad.len(), 2, "{diags:?}");
    assert!(bad[0].contains("ghost"));
    assert!(bad[1].contains("wraith"));
}
