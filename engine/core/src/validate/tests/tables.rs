//! `repeatHeader`/`autoPageBreak`/`keepTogether` are inert on a
//! non-flow (bounded) table — inside a container, an absolute body, or a
//! band — and warn `table_pagination_key_ignored`; on a flow-body table
//! they stay live.

use super::*;

#[test]
fn flow_body_table_pagination_keys_are_live() {
    let t = tpl(
        "      - type: table\n        keepTogether: true\n        autoPageBreak: false\n        repeatHeader: true\n        data: { key: order_items }\n        columns:\n          - data: { key: name }\n",
    );
    assert!(!validate(None, &t, None)
        .iter()
        .any(|d| d.code == "table_pagination_key_ignored"));
}

#[test]
fn container_table_pagination_key_warns_with_path() {
    let t = nested_containers(
        1,
        "- type: table\n  keepTogether: true\n  data: { key: order_items }\n  columns:\n    - data: { key: name }",
    );
    let diags = validate(None, &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "table_pagination_key_ignored")
        .expect("warn");
    assert!(d.path.as_deref().is_some_and(|p| p.contains(".items[0]")));
}

#[test]
fn absolute_body_header_and_footer_table_keys_warn() {
    let t = parse_template(
        r#"
sections:
  header:
    items:
      - type: table
        repeatHeader: true
        data: { key: order_items }
        columns: [ { data: { key: name } } ]
  footer:
    items:
      - type: table
        keepTogether: true
        data: { key: order_items }
        columns: [ { data: { key: name } } ]
  body:
    type: absolute
    items:
      - type: table
        autoPageBreak: false
        data: { key: order_items }
        columns: [ { data: { key: name } } ]
"#,
    )
    .expect("template");
    let n = validate(None, &t, None)
        .iter()
        .filter(|d| d.code == "table_pagination_key_ignored")
        .count();
    assert_eq!(n, 3);
}

#[test]
fn bounded_table_without_pagination_keys_is_clean() {
    let t = nested_containers(
        1,
        "- type: table\n  data: { key: order_items }\n  columns:\n    - data: { key: name }",
    );
    assert!(!validate(None, &t, None)
        .iter()
        .any(|d| d.code == "table_pagination_key_ignored"));
}
