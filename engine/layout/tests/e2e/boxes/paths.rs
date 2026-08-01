//! Path-addressing: every item — id-carrying or not — emits a
//! `PlacedBox` whose `path` follows the validate-diagnostic grammar,
//! across every placement context, plus the id-independence invariant.

use super::{find, page_boxes};
use crate::common::*;

/// The `path`s recorded on a page, in document order.
fn paths(out: &LayoutOutput, page: usize) -> Vec<String> {
    page_boxes(out, page)
        .iter()
        .map(|b| b.path.clone())
        .collect()
}

fn has(out: &LayoutOutput, page: usize, path: &str) -> bool {
    paths(out, page).iter().any(|p| p == path)
}

#[test]
fn nested_container_children_use_dotted_item_paths() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: container
        box: { w: 200, h: 100 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    assert!(has(&out, 0, "sections.body.items[0]"), "container");
    assert!(
        has(&out, 0, "sections.body.items[0].items[0]"),
        "rect child"
    );
}

#[test]
fn band_items_use_the_section_base_path() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { x: 0, y: 0, w: 50, h: 10 }
  footer:
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { x: 0, y: 0, w: 50, h: 10 }
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 100 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 10, h: 10 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    assert!(has(&out, 0, "sections.header.items[0]"));
    assert!(has(&out, 0, "sections.footer.items[0]"));
    assert!(has(&out, 0, "sections.body.items[0]"));
}

#[test]
fn repeat_cell_and_children_use_cell_item_paths() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 400 }
    items:
      - type: repeat
        data: { key: arr }
        grid: { columns: 1 }
        cell:
          box: { padding: { top: 5 } }
          items:
            - type: text
              data: { key: v }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "arr": [ {"v": "a"}, {"v": "b"} ] }),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    // Two elements → the cell container path and its child text path each
    // appear once per bound element (counted across pages: a 1-column
    // grid tiles the elements down the region and may paginate).
    let all: Vec<String> = out
        .boxes
        .pages
        .iter()
        .flatten()
        .map(|b| b.path.clone())
        .collect();
    let count = |want: &str| all.iter().filter(|s| *s == want).count();
    assert_eq!(count("sections.body.items[0].cell"), 2);
    assert_eq!(count("sections.body.items[0].cell.items[0]"), 2);
}

#[test]
fn repeat_flow_card_and_children_use_item_item_paths() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 400 }
    items:
      - type: repeat_flow
        data: { key: arr }
        item:
          box: { h: 30 }
          items:
            - type: text
              data: { key: v }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "arr": [ {"v": "a"}, {"v": "b"} ] }),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let p = paths(&out, 0);
    let count = |want: &str| p.iter().filter(|s| *s == want).count();
    assert_eq!(count("sections.body.items[0].item"), 2);
    assert_eq!(count("sections.body.items[0].item.items[0]"), 2);
}

#[test]
fn grid_children_use_dotted_item_paths() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: container
        box: { type: grid, w: 200, h: 100, columns: 2 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 80, h: 20 }
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 80, h: 20 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    assert!(has(&out, 0, "sections.body.items[0].items[0]"));
    assert!(has(&out, 0, "sections.body.items[0].items[1]"));
}

#[test]
fn page_break_emits_no_box_but_siblings_stay_addressed() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
      - type: page_break
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let all: Vec<String> = out
        .boxes
        .pages
        .iter()
        .flatten()
        .map(|b| b.path.clone())
        .collect();
    // items[1] is the page_break — no geometry, no box; its index is
    // still consumed so the following rect stays items[2].
    assert!(all.iter().any(|s| s == "sections.body.items[0]"));
    assert!(all.iter().any(|s| s == "sections.body.items[2]"));
    assert!(!all.iter().any(|s| s == "sections.body.items[1]"));
}

#[test]
fn id_does_not_change_box_geometry_or_path() {
    let tmpl = |id_line: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
      - type: rect
        style: {{ borderWidth: 1 }}
        {id_line}
        box: {{ w: 50, h: 20 }}
      - type: text
        text: hello
        style: {{ fontSize: 10, lineHeight: 1.0 }}
        box: {{ w: 100 }}
"#
        )
    };
    let with = run_full(&tmpl("id: r1"), json!({}));
    let without = run_full(&tmpl(""), json!({}));
    let (bw, bo) = (page_boxes(&with, 0), page_boxes(&without, 0));
    assert_eq!(bw.len(), bo.len());
    for (a, b) in bw.iter().zip(bo) {
        // Geometry and structural address are independent of `id:`.
        assert_eq!(a.path, b.path);
        assert_eq!(a.border, b.border);
        assert_eq!(a.content, b.content);
    }
    // Only the id field differs between the two runs.
    assert_eq!(find(bw, "r1").path, "sections.body.items[0]");
    assert_eq!(bo[0].id, None);
    assert_eq!(bo[0].path, "sections.body.items[0]");
}
