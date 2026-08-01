//! `horizontal_overflow` (flex rows + the flow region): over-wide fixed
//! rows warn, clipping parents stay silent, unsized rows never warn.

use crate::common::*;

fn page(items: &str) -> String {
    format!(
        "page:\n  size: {{ w: 200, h: 200 }}\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n{items}"
    )
}

#[test]
fn over_wide_fixed_row_warns() {
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "horizontal_overflow"));
}

#[test]
fn exact_fit_row_does_not_warn() {
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row, gap: 10 }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 45, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 45, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "horizontal_overflow"));
}

#[test]
fn unsized_children_shrink_and_stay_silent() {
    // Flex shares always fit by construction.
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        items:\n          - { type: text, text: あああ }\n          - { type: text, text: いいい }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "horizontal_overflow"));
}

#[test]
fn overflow_hidden_parent_clips_by_intent_and_stays_silent() {
    let yaml = page(
        "      - type: container\n        box: { w: 100, direction: row }\n        style: { overflow: hidden }\n        items:\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n          - { type: rect, style: { borderWidth: 1 }, box: { w: 80, h: 10 } }\n",
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "horizontal_overflow"));
}

#[test]
fn flow_item_past_the_region_edge_warns() {
    let yaml =
        page("      - { type: rect, style: { borderWidth: 1 }, box: { x: 150, w: 100, h: 10 } }\n");
    let (_, diags) = run(&yaml, json!({}));
    let hit = diags
        .iter()
        .find(|d| d.code == "horizontal_overflow")
        .expect("overflow warning");
    // 150 + 100 over a 200pt region: 50pt past the edge.
    assert!(hit.message.contains("50.0pt"), "{}", hit.message);
}

#[test]
fn filling_flow_items_never_warn() {
    let yaml = page("      - { type: text, text: あ, box: { w: 100% } }\n");
    let (_, diags) = run(&yaml, json!({}));
    assert!(diags.iter().all(|d| d.code != "horizontal_overflow"));
}
