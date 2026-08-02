//! `repeat_flow` validation: array groups, card bindings, nesting depth,
//! styles, and box-key placement — the flow-repeat side of `repeat.rs`.

use super::*;

#[test]
fn repeat_flow_valid_array_and_card_bindings_pass() {
    let template = tpl(r#"
      - type: repeat_flow
        data: { key: order_items }
        item:
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
fn repeat_flow_data_key_unknown_in_definitions_is_error() {
    let template = tpl(r#"
      - type: repeat_flow
        data: { key: ghost_items }
        item:
          items: []
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "unknown_data_key");
    assert!(diags.items[0].message.contains("ghost_items"));
}

#[test]
fn repeat_flow_data_key_must_be_an_array_group() {
    let template = tpl(r#"
      - type: repeat_flow
        data: { key: order.code }
        item:
          items: []
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags
        .iter()
        .any(|d| d.code == "not_an_array" && d.message.contains("order.code")));
}

#[test]
fn repeat_flow_card_bindings_are_array_scoped_and_pathed() {
    let template = tpl(r#"
      - type: repeat_flow
        data: { key: order_items }
        item:
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
        .is_some_and(|p| p.contains(".item.items[0].items[0]"))));
}

#[test]
fn repeat_flow_params_missing_and_non_array_are_flagged() {
    let template = tpl(r#"
      - type: repeat_flow
        data: { key: order_items }
        item:
          items: []
"#);
    let diags = validate(None, &template, Some(&json!({})));
    assert!(!diags.has_errors());
    assert_eq!(diags.items[0].code, "missing_data");
    let diags = validate(None, &template, Some(&json!({"order_items": 7})));
    assert_eq!(diags.items[0].code, "not_an_array");
}

#[test]
fn repeat_flow_nested_in_container_and_inside_repeat_cell_are_collected() {
    let template = tpl(r#"
      - type: container
        items:
          - type: repeat_flow
            data: { key: order_items }
            item:
              items:
                - type: text
                  data: { key: ghost }
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: repeat_flow
              data: { key: order_items }
              item:
                items:
                  - type: text
                    data: { key: alsoghost }
"#);
    let diags = validate(Some(&defs()), &template, None);
    let msgs: Vec<&str> = diags.iter().map(|d| d.message.as_str()).collect();
    assert!(msgs.iter().any(|m| m.contains("ghost")), "outer: {diags:?}");
    assert!(
        msgs.iter().any(|m| m.contains("alsoghost")),
        "nested: {diags:?}"
    );
}

#[test]
fn repeat_flow_card_counts_toward_container_depth_cap() {
    let mut card_items = String::new();
    let mut indent = String::from("            ");
    for _ in 0..MAX_CONTAINER_DEPTH {
        card_items.push_str(&format!("{indent}- type: container\n{indent}  items:\n"));
        indent.push_str("    ");
    }
    card_items.push_str(&format!("{indent}- type: text\n{indent}  text: deep\n"));
    let yaml = format!(
        "sections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    \
             items:\n      - type: repeat_flow\n        data: {{ key: order_items }}\n        \
             item:\n          items:\n{card_items}"
    );
    let template = parse_template(&yaml).expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "container_depth_exceeded"));
}

#[test]
fn repeat_flow_card_style_names_and_box_keys_are_validated() {
    let template = tpl(r#"
      - type: repeat_flow
        data: { key: order_items }
        item:
          styleNames: [ghostCard]
          box: { columns: 2 }
          items:
            - type: text
              data: { key: name }
              styleNames: [ghostText]
"#);
    let diags = validate(None, &template, None);
    let style_paths: Vec<&str> = diags
        .iter()
        .filter(|d| d.code == "undefined_style_name")
        .map(|d| d.path.as_deref().unwrap_or(""))
        .collect();
    assert_eq!(style_paths.len(), 2, "{diags:?}");
    assert!(style_paths.iter().any(|p| p.ends_with(".item")));
    assert!(style_paths.iter().any(|p| p.contains(".item.items[0]")));
    // Grid keys on the card without `box.type: grid` warn like a container.
    assert!(diags.iter().any(|d| d.code == "grid_key_ignored"));
}
