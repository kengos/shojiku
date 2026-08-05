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
    parse_template(&format!(
        r#"
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 700 }}
    items:
{body_items}
"#
    ))
    .expect("template")
}
pub(super) fn nested_containers(depth: usize, innermost_items: &str) -> Template {
    let mut yaml = String::from("sections:\n  body:\n    type: absolute\n    items:\n");
    let mut indent = String::from("      ");
    for _ in 0..depth {
        yaml.push_str(&format!("{indent}- type: container\n{indent}  items:\n"));
        indent.push_str("    ");
    }
    for line in innermost_items.lines() {
        yaml.push_str(&format!("{indent}{line}\n"));
    }
    parse_template(&yaml).expect("template")
}
