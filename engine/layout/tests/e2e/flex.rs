//! Flex placement (box-model Phase 2), split by axis/concern:
//! `column` (stacking, justify/align, auto margins), `row` (side-by-side
//! placement and shares), and `mixed` (absolute escape hatch, flow auto
//! margins, repeat cells, box index, hostile degradations). Shared
//! template builders live here.

use crate::common::*;

mod baseline;
mod column;
mod freeze;
mod intrinsic;
mod mixed;
mod overflow;
mod row;

pub(crate) fn container_body(container_box: &str, children: &str) -> String {
    let mut yaml = format!(
        "page: {{ margin: 0 }}\nsections:\n  body:\n    type: absolute\n    items:\n      - type: container\n        box: {container_box}\n        items:\n"
    );
    for line in children.lines() {
        yaml.push_str(&format!("          {line}\n"));
    }
    yaml
}

fn rect_ys(yaml: &str) -> Vec<f64> {
    let (doc, diags) = run(yaml, json!({}));
    assert!(!diags.has_errors(), "{:?}", diags);
    rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect()
}

const TWO_RECTS: &str =
    "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 200, h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 200, h: 20 }";
