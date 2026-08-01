//! Validation of the `scope: document` escape inside a data-scoped
//! construct: the key is checked against the top-level scalars instead of
//! the array group — and is still CHECKED, so the escape never opens an
//! unvalidated data path.

use super::*;

/// A `repeat` whose cell holds `items`, bound to the `order_items` group.
fn repeat(items: &str) -> Template {
    tpl(&format!(
        r#"      - type: repeat
        data: {{ key: order_items }}
        grid: {{ columns: 2, rows: 2 }}
        cell:
          items:
{items}
"#
    ))
}

#[test]
fn a_declared_top_level_key_passes_inside_a_cell() {
    // Without the escape this is `unknown_data_key` — `order.code` is not
    // a field of the `order_items` group.
    let template = repeat(
        r#"            - type: text
              data: { key: order.code, scope: document }"#,
    );
    let params = json!({ "order": {"code": "A"}, "order_items": [{"name": "x"}] });
    let diags = validate(Some(&defs()), &template, Some(&params));
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
}

#[test]
fn an_undeclared_top_level_key_is_still_reported() {
    let template = repeat(
        r#"            - type: text
              data: { key: order.ghost, scope: document }"#,
    );
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.has_errors(), "{diags:?}");
    assert_eq!(diags.items[0].code, "unknown_data_key");
    // Reported against definitions, not the array group — the escape
    // changes WHICH catalog is consulted, never whether one is.
    assert!(diags.items[0].message.contains("definitions"), "{diags:?}");
}

#[test]
fn an_element_key_used_with_the_escape_is_reported_as_unknown() {
    // `name` is a field of the group, NOT a top-level scalar: escaping to
    // the document must not silently keep finding it.
    let template = repeat(
        r#"            - type: text
              data: { key: name, scope: document }"#,
    );
    let diags = validate(Some(&defs()), &template, None);
    assert_eq!(diags.items[0].code, "unknown_data_key");
}

#[test]
fn the_default_scope_still_checks_the_array_group() {
    let template = repeat(
        r#"            - type: text
              data: { key: ghost }"#,
    );
    let diags = validate(Some(&defs()), &template, None);
    assert_eq!(diags.items[0].code, "unknown_data_key");
    assert!(diags.items[0].message.contains("order_items"), "{diags:?}");
}

#[test]
fn the_format_variant_is_checked_at_the_document_scope() {
    let template = repeat(
        r#"            - type: text
              data: { key: order.ordered_at, format: iso, scope: document }"#,
    );
    let diags = validate(Some(&defs()), &template, None);
    assert_eq!(diags.items.len(), 1, "{diags:?}");
    assert_eq!(diags.items[0].code, "unknown_format");
}

#[test]
fn a_missing_top_level_value_warns_from_inside_a_cell() {
    let template = repeat(
        r#"            - type: text
              data: { key: order.code, scope: document }"#,
    );
    // Definitions are required to reach the cell walk at all (the whole
    // cell check is catalog-gated, for element-scoped bindings too), so
    // this is the params-side half of the same routing.
    let params = json!({ "order_items": [{"name": "x"}] });
    let diags = validate(Some(&defs()), &template, Some(&params));
    assert!(
        diags.items.iter().any(|d| d.code == "missing_data"),
        "{diags:?}"
    );
}

#[test]
fn a_placeholder_covers_the_missing_document_value() {
    let template = repeat(
        r#"            - type: text
              data: { key: order.code, scope: document, placeholder: "—" }"#,
    );
    let params = json!({ "order_items": [{"name": "x"}] });
    let diags = validate(Some(&defs()), &template, Some(&params));
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
}

#[test]
fn a_table_cell_column_routes_the_escape_the_same_way() {
    let template = tpl(r#"      - type: table
        data: { key: order_items }
        columns:
          - cell:
              items:
                - type: text
                  data: { key: order.code, scope: document }
                - type: text
                  data: { key: order.ghost, scope: document }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert_eq!(diags.items.len(), 1, "{diags:?}");
    assert_eq!(diags.items[0].code, "unknown_data_key");
    assert!(
        diags.items[0].path.as_deref() == Some("sections.body.items[0].columns[0].cell.items[1]"),
        "{diags:?}"
    );
}

#[test]
fn an_escaped_cell_image_checks_the_top_level_key() {
    let template = repeat(
        r#"            - type: image
              box: { w: 20, h: 20 }
              data: { key: order.ghost, scope: document }"#,
    );
    let diags = validate(Some(&defs()), &template, None);
    assert_eq!(diags.items[0].code, "unknown_data_key");
}

#[test]
fn interpolation_inside_a_cell_stays_element_scoped() {
    // `{key}` has no scope slot, so a top-level key in cell text is still
    // checked against the group (and reported).
    let template = repeat(
        r#"            - type: text
              text: "{order.code}""#,
    );
    let diags = validate(Some(&defs()), &template, None);
    assert_eq!(diags.items[0].code, "unknown_data_key");
    assert!(diags.items[0].message.contains("order_items"), "{diags:?}");
}

#[test]
fn a_plain_table_column_routes_the_escape_to_the_scalars() {
    let template = tpl(r#"      - type: table
        data: { key: order_items }
        columns:
          - data: { key: order.code, scope: document }
          - data: { key: order.ghost, scope: document }
          - data: { key: name }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert_eq!(diags.items.len(), 1, "{diags:?}");
    assert_eq!(diags.items[0].code, "unknown_data_key");
    assert!(diags.items[0].message.contains("definitions"), "{diags:?}");
}
