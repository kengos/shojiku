//! Unit tests for template validation; shared fixtures live here,
//! grouped cases in the child modules.

mod binding_scope;
mod bindings;
mod bindings_decl;
mod cell_images;
mod char_grid;
mod column_cells;
mod document;
mod equals_predicates;
mod format_picks;
mod list_entries;
mod marks;
mod placeholder;
mod repeat;
mod repeat_flow;
mod row_conditions;
mod ruby;
mod schema;
mod shapes;
mod spans;
mod structure;
mod tables;
mod visibility;

use super::*;
use crate::definitions::parse_definitions;
use crate::style::{MAX_STYLES, MAX_STYLE_NAMES};
use crate::template::{parse_template, MAX_CONTAINER_DEPTH, MAX_ROW_CONDITIONAL_STYLES, MAX_SPANS};
use serde_json::json;

pub(super) fn defs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  order:
    type: object
    properties:
      code:
        type: string
      ordered_at:
        type: string
        format: date-time
        displayFormats:
          - id: default
          - id: ja
      total:
        type: number
        format: currency
        displayFormats:
          - id: default
  order_items:
    type: array
    items:
      type: object
      properties:
        name:
          type: string
        quantity:
          type: number
          format: quantity
"#,
    )
    .expect("defs")
}
pub(super) fn tpl(body_items: &str) -> Template {
    parse_template(&flow_yaml(body_items)).expect("template")
}
/// [`tpl`] read WITHOUT the parse-time nesting bound — the only way a
/// template nested past `MAX_CONTAINER_DEPTH` still reaches validation,
/// whose own cap is what these tests pin.
pub(super) fn tpl_unguarded(body_items: &str) -> Template {
    unguarded(&flow_yaml(body_items))
}
fn flow_yaml(body_items: &str) -> String {
    format!(
        r#"
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 700 }}
    items:
{body_items}
"#
    )
}
/// Deserializes a template straight from YAML, skipping the parse door's
/// checks (see [`tpl_unguarded`]).
pub(super) fn unguarded(yaml: &str) -> Template {
    serde_yaml::from_str(yaml).expect("template")
}
pub(super) fn nested_containers(depth: usize, innermost_items: &str) -> Template {
    parse_template(&nested_containers_yaml(depth, innermost_items)).expect("template")
}
/// [`nested_containers`] without the parse-time nesting bound (see
/// [`tpl_unguarded`]).
pub(super) fn nested_containers_unguarded(depth: usize, innermost_items: &str) -> Template {
    unguarded(&nested_containers_yaml(depth, innermost_items))
}
fn nested_containers_yaml(depth: usize, innermost_items: &str) -> String {
    let mut yaml = String::from("sections:\n  body:\n    type: absolute\n    items:\n");
    let mut indent = String::from("      ");
    for _ in 0..depth {
        yaml.push_str(&format!("{indent}- type: container\n{indent}  items:\n"));
        indent.push_str("    ");
    }
    for line in innermost_items.lines() {
        yaml.push_str(&format!("{indent}{line}\n"));
    }
    yaml
}
