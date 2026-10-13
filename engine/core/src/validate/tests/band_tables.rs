//! Tables and repeats in the header and footer bands get the same key
//! checks as body ones: the bound source, a column's `data:`, a row
//! condition's key, a `cell:` column's bindings, and the params-side
//! array check — reported at the band's own path.

use super::*;

/// A template whose `band` (`header` / `footer`) holds `band_items`
/// (indented to the band's `items:` list level) over an empty flow body.
fn band_tpl(band: &str, band_items: &str) -> Template {
    parse_template(&format!(
        "sections:\n  {band}:\n    items:\n{band_items}  body:\n    type: flow\n    items: []\n"
    ))
    .expect("template")
}

fn paths_of<'a>(diags: &'a Diagnostics, code: &str) -> Vec<&'a str> {
    diags
        .iter()
        .filter(|d| d.code == code)
        .filter_map(|d| d.path.as_deref())
        .collect()
}

#[test]
fn a_header_table_with_an_unknown_source_is_reported() {
    let t = band_tpl(
        "header",
        "      - type: table\n        data: { key: ghost_items }\n        columns: [ { data: { key: name } } ]\n",
    );
    let diags = validate(Some(&defs()), &t, None);
    assert_eq!(
        paths_of(&diags, "unknown_data_key"),
        ["sections.header.items[0]"]
    );
}

#[test]
fn a_footer_table_checks_column_row_condition_and_cell_keys() {
    let t = band_tpl(
        "footer",
        r##"      - type: table
        data: { key: order_items }
        row:
          conditionalStyles:
            - { when: { key: ghost_flag }, style: { color: "#f00" } }
        columns:
          - data: { key: ghost_col }
          - cell:
              items:
                - { type: text, data: { key: ghost_cell } }
"##,
    );
    let diags = validate(Some(&defs()), &t, None);
    assert_eq!(
        paths_of(&diags, "unknown_data_key"),
        [
            "sections.footer.items[0].columns[0]",
            "sections.footer.items[0].columns[1].cell.items[0]",
            "sections.footer.items[0].row.conditionalStyles[0]",
        ]
    );
}

#[test]
fn a_table_in_a_band_container_is_collected() {
    let t = band_tpl(
        "header",
        "      - type: container\n        items:\n          - type: table\n            data: { key: order_items }\n            columns: [ { data: { key: ghost_col } } ]\n",
    );
    let diags = validate(Some(&defs()), &t, None);
    assert_eq!(
        paths_of(&diags, "unknown_data_key"),
        ["sections.header.items[0].items[0].columns[0]"]
    );
}

#[test]
fn a_band_table_known_to_definitions_is_clean() {
    let t = band_tpl(
        "footer",
        "      - type: table\n        data: { key: order_items }\n        columns: [ { label: Item, data: { key: name } } ]\n",
    );
    let params = json!({ "order_items": [{ "name": "x", "quantity": 1 }] });
    let diags = validate(Some(&defs()), &t, Some(&params));
    assert!(diags.is_empty(), "{diags:?}");
}

#[test]
fn a_band_table_gets_the_params_side_array_check() {
    let t = band_tpl(
        "header",
        "      - type: table\n        data: { key: order_items }\n        columns: [ { data: { key: name } } ]\n",
    );
    let missing = validate(None, &t, Some(&json!({})));
    assert_eq!(
        paths_of(&missing, "missing_data"),
        ["sections.header.items[0]"]
    );
    let scalar = validate(None, &t, Some(&json!({ "order_items": 3 })));
    assert_eq!(
        paths_of(&scalar, "not_an_array"),
        ["sections.header.items[0]"]
    );
}

#[test]
fn band_repeats_still_get_their_key_check() {
    // Layout skips both (`repeat_in_band` / `repeat_flow_in_band`), but a
    // wrong key is still worth naming before the author moves them.
    let header = band_tpl(
        "header",
        "      - type: repeat\n        data: { key: ghost_items }\n        cell:\n          items: []\n",
    );
    assert_eq!(
        paths_of(&validate(Some(&defs()), &header, None), "unknown_data_key"),
        ["sections.header.items[0]"]
    );
    let footer = band_tpl(
        "footer",
        "      - type: repeat_flow\n        data: { key: order_items }\n        item:\n          items:\n            - { type: text, data: { key: ghost_cell } }\n",
    );
    assert_eq!(
        paths_of(&validate(Some(&defs()), &footer, None), "unknown_data_key"),
        ["sections.footer.items[0].item.items[0]"]
    );
}
