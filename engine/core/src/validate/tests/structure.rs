//! Structural validation: container walks, depth cap, style names.

use super::*;

#[test]
fn container_children_are_walked_recursively() {
    let template = nested_containers(
        2,
        "- type: text\n  data: { key: order.ghost }\n- type: image\n  box: { w: 10, h: 10 }",
    );
    let diags = validate(Some(&defs()), &template, None);
    let codes: Vec<&str> = diags.items.iter().map(|d| d.code.as_str()).collect();
    assert!(codes.contains(&"unknown_data_key"));
    assert!(codes.contains(&"image_source_missing"));
    // Paths reflect the nesting.
    assert!(diags.items[0]
        .path
        .as_deref()
        .is_some_and(|p| p.contains(".items[0].items[0]")));
}

#[test]
fn container_tables_are_binding_checked() {
    let template = nested_containers(
            1,
            "- type: table\n  data: { key: order.code }\n  columns:\n    - data: { key: name }\n      width: 100",
        );
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.iter().any(|d| d.code == "not_an_array"));
}

#[test]
fn container_depth_over_cap_is_error() {
    let ok = nested_containers(MAX_CONTAINER_DEPTH, "- type: text\n  text: deep");
    assert!(!validate(None, &ok, None).has_errors());

    let too_deep = nested_containers(MAX_CONTAINER_DEPTH + 1, "- type: text\n  text: deeper");
    let diags = validate(None, &too_deep, None);
    assert!(diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "container_depth_exceeded"));
}

#[test]
fn empty_definitions_warns_once_above_the_unknown_key_flood() {
    // A definitions file with zero properties defines no keys, so the
    // binding below is unknown; the upstream cause is surfaced once so the
    // flood is diagnosable.
    let empty = parse_definitions("type: object\nproperties: {}\n").expect("parse");
    let template = tpl(r#"
      - type: text
        data: { key: order.code }
"#);
    let diags = validate(Some(&empty), &template, None);
    let empties: Vec<&str> = diags
        .iter()
        .filter(|d| d.code == "empty_definitions")
        .map(|d| d.code.as_str())
        .collect();
    assert_eq!(empties.len(), 1, "expected exactly one: {diags:?}");
    assert!(diags.iter().any(|d| d.code == "unknown_data_key"));
}

#[test]
fn non_empty_definitions_do_not_warn_empty() {
    let template = tpl(r#"
      - type: text
        data: { key: order.code }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(!diags.iter().any(|d| d.code == "empty_definitions"));
}

#[test]
fn interpolated_keys_are_checked() {
    let template = tpl(r#"
      - type: text
        text: "code: {order.ghost}"
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors());
    assert_eq!(diags.items[0].code, "unknown_data_key");
}

#[test]
fn undefined_style_name_warns_across_every_styled_item() {
    // A styleName reference with no registry entry warns, at every place
    // a style can be attached: text, container, page_number, image, and
    // a table's header + column.
    let template = parse_template(
        r#"
styles:
  known: { fontSize: 12 }
sections:
  header:
    items:
      - type: page_number
        styleNames: [ghostA]
  body:
    type: absolute
    items:
      - type: text
        text: hi
        styleNames: [known, ghostB]
      - type: container
        styleNames: [ghostC]
        items: []
      - type: image
        box: { w: 10, h: 10 }
        src: logo.png
        styleNames: [ghostF]
      - type: qr_code
        box: { w: 10, h: 10 }
        text: t
        styleNames: [ghostG]
      - type: list
        data: { key: rows }
        styleNames: [ghostH]
      - type: table
        data: { key: rows }
        styleNames: [ghostI]
        row:
          styleNames: [ghostJ]
          alternateStyleNames: [ghostK]
        header:
          styleNames: [ghostD]
        columns:
          - data: { key: name }
            width: 100
            styleNames: [ghostE]
"#,
    )
    .expect("template");
    let diags = validate(None, &template, None);
    let undefined: Vec<&str> = diags
        .iter()
        .filter(|d| d.code == "undefined_style_name")
        .map(|d| d.path.as_deref().unwrap_or(""))
        .collect();
    assert_eq!(undefined.len(), 11, "one per ghost*: {diags:?}");
    // The table's own, row, and alternate styleNames each carry a
    // distinguishing path.
    assert!(undefined.iter().any(|p| p.ends_with(".row")));
    assert!(undefined.iter().any(|p| p.ends_with(".row.alternate")));
    // The defined `known` reference produces no warning.
    assert!(!diags.iter().any(|d| d.message.contains("known")));
}

#[test]
fn defined_style_name_has_no_diagnostic() {
    let template = parse_template(
        r#"
styles:
  emphasis: { fontSize: 14 }
sections:
  body:
    type: absolute
    items:
      - { type: text, text: hi, styleNames: [emphasis] }
"#,
    )
    .expect("template");
    let diags = validate(None, &template, None);
    // A fully-defined reference leaves the template clean.
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
}

#[test]
fn too_many_style_names_on_one_item_warns() {
    let names: String = (0..=MAX_STYLE_NAMES)
        .map(|i| format!("s{i}"))
        .collect::<Vec<_>>()
        .join(", ");
    let template = parse_template(&format!(
            "sections:\n  body:\n    type: absolute\n    items:\n      - {{ type: text, text: hi, styleNames: [{names}] }}\n"
        ))
        .expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "too_many_style_names"));
}

#[test]
fn too_many_styles_in_registry_warns() {
    let mut yaml = String::from("styles:\n");
    for i in 0..=MAX_STYLES {
        yaml.push_str(&format!("  s{i}: {{ fontSize: 10 }}\n"));
    }
    yaml.push_str("sections:\n  body:\n    type: absolute\n    items: []\n");
    let template = parse_template(&yaml).expect("template");
    let diags = validate(None, &template, None);
    assert!(diags.iter().any(|d| d.code == "too_many_styles"));
}

// ---- Imposition / n-up (`type: repeat`) ---------------------------------

// ---- Flex keys (box-model Phase 2) --------------------------------------

#[test]
fn layout_keys_on_leaf_boxes_warn_everywhere() {
    // A leaf in the body, and one nested inside a container: both warn
    // with their template paths.
    let template = parse_template(
        "sections:\n  body:\n    type: absolute\n    items:\n      - { type: text, text: hi, box: { alignItems: center } }\n      - type: container\n        items:\n          - { type: rect, box: { w: 10, h: 10, justifyContent: end } }\n",
    )
    .expect("template");
    let diags = validate(None, &template, None);
    let hits: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "layout_key_on_leaf")
        .collect();
    assert_eq!(hits.len(), 2, "{diags:?}");
    assert_eq!(hits[0].path.as_deref(), Some("sections.body.items[0]"));
    assert_eq!(
        hits[1].path.as_deref(),
        Some("sections.body.items[1].items[0]")
    );
}

#[test]
fn layout_keys_on_container_and_cell_boxes_do_not_warn() {
    let template = parse_template(
        "sections:\n  header:\n    items:\n      - { type: page_number, box: { x: 0, y: 0, w: 100, h: 10 } }\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: container\n        box: { justifyContent: center, direction: row }\n        items: []\n      - type: repeat\n        data: { key: cards }\n        cell:\n          box: { alignItems: end }\n          items:\n            - { type: text, text: ok }\n",
    )
    .expect("template");
    let diags = validate(None, &template, None);
    assert!(
        !diags.iter().any(|d| d.code == "layout_key_on_leaf"),
        "{diags:?}"
    );
}

#[test]
fn grid_keys_without_grid_type_warn_on_containers_and_cells() {
    let template = parse_template(
        "sections:\n  body:\n    type: absolute\n    items:\n      - type: container\n        box: { columns: 2 }\n        items: []\n      - type: container\n        box: { type: grid, columns: 2 }\n        items: []\n",
    )
    .expect("template");
    let diags = validate(None, &template, None);
    let hits: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "grid_key_ignored")
        .collect();
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(hits[0].path.as_deref(), Some("sections.body.items[0]"));
}

#[test]
fn grid_keys_under_grid_type_do_not_warn_including_cells() {
    let template = parse_template(
        "sections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: repeat\n        data: { key: cards }\n        cell:\n          box: { type: grid, columns: 2, rowGap: 4 }\n          items: []\n      - type: repeat\n        data: { key: cards }\n        cell:\n          box: { rowGap: 4 }\n          items: []\n",
    )
    .expect("template");
    let diags = validate(None, &template, None);
    let hits: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "grid_key_ignored")
        .collect();
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(hits[0].path.as_deref(), Some("sections.body.items[1]"));
}

#[test]
fn qr_code_scalar_bindings_are_checked_like_text() {
    // Top-level qr_code `data:` and `{key}` interpolation go through the
    // same scalar walk as text items.
    let template = tpl(r#"
      - type: qr_code
        box: { w: 40, h: 40 }
        data: { key: ghost_token }
      - type: qr_code
        box: { w: 40, h: 40 }
        text: "https://x.example/{order.ghost}"
"#);
    let diags = validate(Some(&defs()), &template, None);
    let unknown: Vec<&str> = diags
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .map(|d| d.message.as_str())
        .collect();
    assert_eq!(unknown.len(), 2, "{diags:?}");
    assert!(unknown[0].contains("ghost_token"));
    assert!(unknown[1].contains("order.ghost"));
}
