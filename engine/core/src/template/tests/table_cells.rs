//! The `cell:` column wire: parsing a per-row sub-template, the
//! `data`-optional column, round-trip fidelity, and typo safety inside
//! the cell.

use super::super::*;

fn table_yaml(table_body: &str) -> String {
    format!(
        "sections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    items:\n      - type: table\n{table_body}"
    )
}

fn first_column(table_body: &str) -> Column {
    let tpl = parse_template(&table_yaml(table_body)).expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Table(t) = &flow.items[0] else { panic!("expected table") };
    t.columns[0].clone()
}

#[test]
fn a_cell_column_parses_its_sub_template() {
    let column = first_column(
        r#"        data: { key: rows }
        columns:
          - label: 備考
            width: 100
            cell:
              box: { padding: 4 }
              style: { fontSize: 8 }
              items:
                - { type: text, data: { key: note } }
                - { type: rect, box: { w: 10, h: 10 } }
"#,
    );
    assert!(column.data.is_none(), "a cell column binds no value itself");
    let cell = column.cell.expect("cell");
    assert_eq!(cell.items.len(), 2);
    assert_eq!(cell.style.font_size, Some(Length::Pt(8.0)));
}

#[test]
fn a_data_column_still_parses_unchanged() {
    let column = first_column(
        r#"        data: { key: rows }
        columns:
          - { label: 品名, data: { key: name, format: ja } }
"#,
    );
    assert_eq!(column.data_key(), Some("name"));
    assert!(column.cell.is_none());
    assert_eq!(column.column_type(), ColumnType::Text);
}

#[test]
fn a_cell_column_round_trips_without_injected_defaults() {
    let column = first_column(
        r#"        data: { key: rows }
        columns:
          - cell:
              items:
                - { type: text, text: hi }
"#,
    );
    // Inspect the COLUMN's own keys: an item inside the cell carries its
    // own `type:` tag, which a substring check would trip over.
    let value: serde_yaml::Value = serde_yaml::to_value(&column).expect("serialize");
    let map = value.as_mapping().expect("a column is a map");
    let keys: Vec<&str> = map.keys().filter_map(|k| k.as_str()).collect();
    // Only what the author wrote (the Designer's "only touched keys
    // change" write policy).
    assert_eq!(keys, vec!["cell"], "injected defaults: {keys:?}");
}

#[test]
fn an_unknown_key_inside_a_cell_is_a_parse_error() {
    let err = parse_template(&table_yaml(
        r#"        data: { key: rows }
        columns:
          - cell:
              items:
                - { type: text, text: hi, zzz: 1 }
"#,
    ))
    .expect_err("unknown key");
    assert!(format!("{err}").contains("zzz"), "{err}");
}

#[test]
fn an_unknown_key_on_the_cell_container_is_a_parse_error() {
    let err = parse_template(&table_yaml(
        r#"        data: { key: rows }
        columns:
          - cell:
              hover: true
              items: []
"#,
    ))
    .expect_err("unknown key");
    assert!(format!("{err}").contains("hover"), "{err}");
}

#[test]
fn a_column_may_author_both_keys_for_validate_to_reject() {
    // The wire stays permissive on purpose: the exclusion is a validate
    // diagnostic carrying the column's path, not a parse rejection that
    // could only point at the body.
    let column = first_column(
        r#"        data: { key: rows }
        columns:
          - data: { key: name }
            cell:
              items: []
"#,
    );
    assert!(column.data.is_some() && column.cell.is_some());
}
