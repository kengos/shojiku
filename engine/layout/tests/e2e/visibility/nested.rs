//! `visible:` where it reaches beyond the item that authored it: a
//! container hiding its whole subtree, a conditional `page_break`, and
//! the `repeat`-element data scope.

use super::contexts::boxes_of;
use crate::common::*;
use serde_json::json;

#[test]
fn a_hidden_container_hides_its_whole_subtree() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        id: group
        box: { x: 0, y: 0, w: 200, h: 100 }
        visible: { key: show }
        items:
          - type: rect
            id: inner
            style: { borderWidth: 1 }
            box: { w: 20, h: 20 }
"#;
    let out = run_full(yaml, json!({ "show": false }));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    // Nothing paints anywhere in the subtree: `visible:` has no
    // force-visible spelling, so there is no descendant escape (which is
    // what makes the non-inherited implementation match CSS).
    assert!(rect_shapes(&out.document.pages[0]).is_empty());
    assert!(boxes_of(&out, "group").hidden);
    assert!(boxes_of(&out, "inner").hidden, "the child too");
}

#[test]
fn a_collapsed_container_reports_no_box_for_itself_or_any_descendant() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        id: group
        box: { x: 0, y: 0, w: 200, h: 100 }
        visible: { key: show, collapse: true }
        items:
          - type: rect
            id: inner
            style: { borderWidth: 1 }
            box: { w: 20, h: 20 }
"#;
    let out = run_full(yaml, json!({ "show": false }));
    let ids: Vec<_> = out.boxes.pages[0]
        .iter()
        .filter_map(|b| b.id.as_deref())
        .collect();
    assert!(
        ids.is_empty(),
        "descendants go with the collapsed parent: {ids:?}"
    );
}

/// A flow with a conditional `page_break` between two rects.
fn with_break(extra: &str) -> String {
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
        box: {{ w: 50, h: 30 }}
      - type: page_break
        visible: {{ key: split{extra} }}
      - type: rect
        style: {{ borderWidth: 1 }}
        box: {{ w: 50, h: 30 }}
"#
    )
}

#[test]
fn a_page_break_whose_predicate_holds_still_breaks() {
    let out = run_full(&with_break(""), json!({ "split": true }));
    assert_eq!(out.document.pages.len(), 2);
}

#[test]
fn a_page_break_whose_predicate_fails_does_not_break() {
    // A `page_break` paints nothing, so hiding and collapsing mean the
    // same thing for it: the break simply does not happen. That is what
    // makes a conditional page break authorable.
    for extra in ["", ", collapse: true"] {
        let out = run_full(&with_break(extra), json!({ "split": false }));
        assert_eq!(out.document.pages.len(), 1, "extra: {extra:?}");
    }
}

#[test]
fn a_page_break_inside_a_collapsed_container_leaves_no_phantom_break() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: container
        box: { w: 100 }
        visible: { key: show, collapse: true }
        items:
          - type: page_break
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 30 }
"#;
    let out = run_full(yaml, json!({ "show": false }));
    assert_eq!(out.document.pages.len(), 1);
}

#[test]
fn visible_inside_a_repeat_cell_scopes_to_the_element() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: repeat
        data: { key: rows }
        grid: { columns: 1, rows: 2 }
        cell:
          box: { w: 200, h: 40 }
          items:
            - type: rect
              style: { borderWidth: 1 }
              box: { x: 0, y: 0, w: 20, h: 20 }
              visible: { key: flagged }
"#;
    let out = run_full(
        yaml,
        json!({ "rows": [{ "flagged": true }, { "flagged": false }] }),
    );
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    // One element shows its mark, the other does not — the same template.
    let drawn: usize = out
        .document
        .pages
        .iter()
        .map(|p| rect_shapes(p).len())
        .sum();
    assert_eq!(drawn, 1);
}

#[test]
fn scope_document_reads_top_level_params_from_inside_a_cell() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: repeat
        data: { key: rows }
        grid: { columns: 1, rows: 2 }
        cell:
          box: { w: 200, h: 40 }
          items:
            - type: rect
              style: { borderWidth: 1 }
              box: { x: 0, y: 0, w: 20, h: 20 }
              visible: { key: draft, scope: document }
"#;
    let out = run_full(
        yaml,
        json!({ "draft": true, "rows": [{ "flagged": false }, { "flagged": false }] }),
    );
    // The page-global flag reaches every element, none of which declares
    // `draft` itself.
    let drawn: usize = out
        .document
        .pages
        .iter()
        .map(|p| rect_shapes(p).len())
        .sum();
    assert_eq!(drawn, 2);
}

/// A table long enough to paginate, hidden or collapsed by `extra`.
fn long_table(extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 200 }}
    items:
      - type: table
        data: {{ key: rows }}
        columns:
          - {{ label: Name, data: {{ key: name }}, width: 200 }}
        visible: {{ key: show{extra} }}
      - type: rect
        id: after
        style: {{ borderWidth: 1 }}
        box: {{ w: 50, h: 30 }}
"#
    )
}

fn many_rows() -> serde_json::Value {
    let rows: Vec<_> = (1..=40)
        .map(|i| json!({ "name": format!("row {i}") }))
        .collect();
    json!({ "rows": rows })
}

#[test]
fn a_hidden_paginating_item_draws_nothing_but_keeps_the_pages_it_reserved() {
    // This is the case `blank_since` exists for: a `table` never hands back
    // an atom, it pushes straight into the pages, so blanking a returned
    // value could not reach it. A hidden one still RESERVES what it would
    // have occupied, and for a paginating item that is measured in pages.
    let mut params = many_rows();
    params["show"] = json!(true);
    let shown = run_full(&long_table(""), params.clone());
    assert!(shown.document.pages.len() > 1, "the fixture must paginate");
    let pages = shown.document.pages.len();

    params["show"] = json!(false);
    let out = run_full(&long_table(""), params);
    assert_eq!(out.document.pages.len(), pages, "the reserved pages stay");
    let drawn: usize = out.document.pages.iter().map(|p| all_text(p).len()).sum();
    assert_eq!(drawn, 0, "and nothing of the table is painted");
    // Every placement it would have made is reported, stamped hidden.
    assert!(
        out.boxes
            .pages
            .iter()
            .flatten()
            .filter(|b| b.path.starts_with("sections.body.items[0]"))
            .all(|b| b.hidden),
        "every box the hidden table produced must be stamped"
    );
}

#[test]
fn a_collapsed_paginating_item_gives_its_pages_back() {
    let mut params = many_rows();
    params["show"] = json!(false);
    let out = run_full(&long_table(", collapse: true"), params);
    // The table is gone entirely, so the document is one page and the
    // following item sits at the top of it.
    assert_eq!(out.document.pages.len(), 1);
    assert_eq!(boxes_of(&out, "after").border.y, 0.0);
}
