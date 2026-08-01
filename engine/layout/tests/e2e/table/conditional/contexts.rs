//! Conditional row styles across the contexts a table renders in: the
//! header row (never), continuation pages, and the bounded (box-placed)
//! table that does not paginate.

use super::*;

#[test]
fn the_header_row_is_never_conditioned() {
    // An entry matching every body row must leave the header alone: the
    // header is chrome, not one of the bound elements.
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        cellPadding: 0
        row:
          conditionalStyles:
            - when: { key: kind, equals: heading }
              style: { textAlign: center }
        columns:
          - label: HEAD
            data: { key: label }
            width: 200
"##,
        json!({ "items": [{ "label": "AAA", "kind": "heading" }] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_centered(&doc.pages[0], "AAA");
    assert_left_aligned(&doc.pages[0], "HEAD");
}

#[test]
fn continuation_page_rows_stay_conditioned() {
    // 40 rows at 24pt each overflow a 300pt region, so the tagged last
    // row lands on page 2 and must still be styled.
    let mut rows: Vec<Value> = (1..=39)
        .map(|i| json!({ "label": format!("r{i}") }))
        .collect();
    rows.push(json!({ "label": "LAST", "kind": "heading" }));
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 300 }
    items:
      - type: table
        data: { key: items }
        cellPadding: 0
        row:
          conditionalStyles:
            - when: { key: kind, equals: heading }
              style: { textAlign: center }
        columns:
          - data: { key: label }
            width: 200
"##,
        json!({ "items": rows }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(doc.pages.len() > 1, "expected pagination");
    let last = doc.pages.last().expect("a page");
    assert_centered(last, "LAST");
}

#[test]
fn a_bounded_table_applies_conditionals_too() {
    // A table inside a container renders as ONE bounded block through a
    // different builder; the row layers must reach it as well.
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 300, h: 200 }
        items:
          - type: table
            data: { key: items }
            cellPadding: 0
            row:
              conditionalStyles:
                - when: { key: kind, equals: heading }
                  style: { backgroundColor: "#00ff00" }
            columns:
              - data: { key: label }
                width: 200
"##,
        json!({ "items": [{ "label": "AAA", "kind": "heading" }, { "label": "BBB" }] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(row_fills(&doc.pages[0]), vec![(0.0, 1.0, 0.0)]);
}
