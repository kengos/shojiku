//! Under hostile / high-volume input: the path stack composes and
//! pops correctly through deep nesting, box emission stays linear in the
//! item/row count, clamped imposition emits boxes only for drawn cells,
//! and an authored `id:` is echoed verbatim while the `path` stays
//! structural (never derived from attacker-controlled strings).

use super::page_boxes;
use crate::common::*;

#[test]
fn deep_nesting_composes_and_pops_the_path_stack() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: container
        box: { w: 300, h: 200 }
        items:
          - type: container
            box: { w: 200, h: 100 }
            items:
              - type: rect
                style: { borderWidth: 1 }
                box: { w: 50, h: 20 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let all: Vec<String> = page_boxes(&out, 0).iter().map(|b| b.path.clone()).collect();
    // The deepest rect composes three item steps.
    assert!(all
        .iter()
        .any(|p| p == "sections.body.items[0].items[0].items[0]"));
    // The top-level sibling is items[1] — proof the stack popped back out
    // of the nested subtree instead of accumulating its segments.
    assert!(all.iter().any(|p| p == "sections.body.items[1]"));
}

#[test]
fn large_table_indexes_every_cell_without_panic() {
    let rows: Vec<Value> = (0..50).map(|i| json!({ "n": i })).collect();
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - label: A
            data: { key: n }
            width: 100
          - label: B
            data: { key: n }
            width: 100
"#,
        json!({ "rows": rows }),
    );
    // Reaching here proves the params-driven row loop terminated. Cell
    // boxes are linear: two columns per body row (100) plus a repeated
    // two-cell header on every page.
    let pages = out.document.pages.len();
    let col_boxes = out
        .boxes
        .pages
        .iter()
        .flatten()
        .filter(|b| b.path.contains(".columns["))
        .count();
    assert_eq!(col_boxes, 2 * 50 + 2 * pages);
}

#[test]
fn imposition_clamp_indexes_only_drawn_cells() {
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
        grid: { columns: 5000, rows: 5000 }
        cell:
          items:
            - type: text
              data: { key: v }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "arr": [ {"v": "a"}, {"v": "b"}, {"v": "c"} ] }),
    );
    // The hostile grid is clamped, not expanded into millions of slots.
    assert!(out
        .diagnostics
        .iter()
        .any(|d| d.code == "imposition_grid_clamped"));
    // Exactly one cell box per bound element — never one per grid slot.
    let cells = out
        .boxes
        .pages
        .iter()
        .flatten()
        .filter(|b| b.path == "sections.body.items[0].cell")
        .count();
    assert_eq!(cells, 3);
}

#[test]
fn hostile_id_is_echoed_but_path_stays_structural() {
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
        id: "evil.items[9].injected"
        box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let b = &page_boxes(&out, 0)[0];
    // The authored id rides through verbatim (a lookup alias)...
    assert_eq!(b.id.as_deref(), Some("evil.items[9].injected"));
    // ...but the structural path is synthesized from position alone, so a
    // path-shaped id cannot spoof another item's address.
    assert_eq!(b.path, "sections.body.items[0]");
}
