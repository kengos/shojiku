//! Hostile-input limits end to end: page cap, container depth cap,
//! length cap, and imposition grid clamps.

use crate::common::*;

#[test]
fn page_cap_truncates_with_error() {
    let rows: Vec<Value> = (1..=100_000).map(|i| json!({"n": i})).collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 50 }
    items:
      - type: table
        data: { key: items }
        columns:
          - data: { key: n }
            width: 100
"#,
        json!({ "items": rows }),
    );
    assert_eq!(doc.pages.len(), MAX_PAGES);
    let capped: Vec<_> = diags.iter().filter(|d| d.code == "page_overflow").collect();
    assert_eq!(capped.len(), 1, "{diags:?}");
    // The cap is hit while placing an item, so the warning names the
    // content that ran away rather than the document as a whole.
    assert_eq!(capped[0].path.as_deref(), Some("sections.body.items[0]"));
}

#[test]
fn content_after_the_page_cap_is_dropped() {
    // A text item following the runaway table exercises the
    // truncated early-return in `place`.
    let rows: Vec<Value> = (1..=100_000).map(|i| json!({"n": i})).collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 50 }
    items:
      - type: table
        data: { key: items }
        columns:
          - data: { key: n }
            width: 100
      - type: text
        text: never placed
"#,
        json!({ "items": rows }),
    );
    assert_eq!(doc.pages.len(), MAX_PAGES);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
    assert!(!all_text(doc.pages.last().expect("pages")).contains("never placed"));
}

#[test]
fn page_cap_stops_text_only_flows_too() {
    // Text items break pages inside `place` itself (unlike table rows),
    // exercising the cap check on that path.
    let mut items = String::new();
    for i in 0..600 {
        items.push_str(&format!(
            "      - {{ type: text, text: \"item {i}\", box: {{ h: 25 }} }}\n"
        ));
    }
    let template = format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 30 }}
    items:
{items}
"#
    );
    let (doc, diags) = run(&template, json!({}));
    assert_eq!(doc.pages.len(), MAX_PAGES);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
}

#[test]
fn container_depth_cap_skips_subtree() {
    let ok = nested_containers_yaml(MAX_CONTAINER_DEPTH, "- type: text\n  text: deep");
    let (doc, diags) = run(&ok, json!({}));
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert!(all_text(&doc.pages[0]).contains("deep"));

    let too_deep = nested_containers_yaml(MAX_CONTAINER_DEPTH + 1, "- type: text\n  text: deeper");
    let (doc, diags) = run(&too_deep, json!({}));
    assert!(diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "container_depth_exceeded"));
    assert!(!all_text(&doc.pages[0]).contains("deeper"));
}

#[test]
fn percent_amplification_hits_length_cap_and_stays_finite() {
    // Eight nested 300% widths would reach 595.28 * 3^8 ≈ 3.9e6 pt;
    // the resolve cap drops the runaway value and falls back to the
    // parent width.
    let mut yaml = String::from("sections:\n  body:\n    type: absolute\n    items:\n");
    let mut indent = String::from("      ");
    for _ in 0..8 {
        yaml.push_str(&format!(
            "{indent}- type: container\n{indent}  box: {{ w: \"300%\" }}\n{indent}  items:\n"
        ));
        indent.push_str("    ");
    }
    yaml.push_str(&format!(
        "{indent}- type: rect\n{indent}  style: {{ borderWidth: 1 }}\n{indent}  box: {{ w: \"100%\", h: 10 }}\n"
    ));
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "length_out_of_range"));
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects.len(), 1);
    assert!(rects[0].x.is_finite() && rects[0].w.is_finite());
    assert!(rects[0].w.abs() <= MAX_RESOLVED_PT);
}

#[test]
fn repeat_grid_over_cap_is_clamped_with_a_warning() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 100, rows: 100 }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({ "cells": [{"label": "A"}, {"label": "B"}] }),
    );
    assert!(diags.iter().any(|d| d.code == "imposition_grid_clamped"));
    // Clamped to 64×1 = 64 cells/page, so two elements fit on one page.
    assert_eq!(doc.pages.len(), 1);
}

#[test]
fn repeat_zero_axis_is_clamped_to_one() {
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 0, rows: 1 }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({ "cells": [{"label": "A"}] }),
    );
    assert!(diags.iter().any(|d| d.code == "imposition_grid_clamped"));
}

#[test]
fn repeat_page_cap_truncates_with_error() {
    let cells: Vec<Value> = (1..=600)
        .map(|i| json!({ "label": format!("c{i}") }))
        .collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({ "cells": cells }),
    );
    assert_eq!(doc.pages.len(), MAX_PAGES);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
}

#[test]
fn repeat_after_page_cap_is_dropped() {
    // A table that runs to the page cap leaves the flow with a non-fresh
    // final page; a following repeat must early-return via the page-cap
    // guard, not panic or add pages.
    let rows: Vec<Value> = (1..=100_000).map(|i| json!({ "n": i })).collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 50 }
    items:
      - type: table
        data: { key: items }
        columns:
          - data: { key: n }
            width: 100
      - type: repeat
        data: { key: cells }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({ "items": rows, "cells": [{"label": "never"}] }),
    );
    assert_eq!(doc.pages.len(), MAX_PAGES);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
    let joined: String = doc.pages.iter().map(all_text).collect();
    assert!(!joined.contains("never"));
}
