//! The structural `BoxIndex` sidecar (mirrors src `boxes.rs`): which
//! items get placements, and that border/content boxes land at the drawn
//! positions across flow, absolute, container, band, repeat, and
//! pagination. Path-addressing of id-less items lives in `paths`.

mod hostile;
mod items;
mod paths;

use crate::common::*;
use shojiku_layout::PlacedBox;

pub fn page_boxes(out: &LayoutOutput, page: usize) -> &[PlacedBox] {
    &out.boxes.pages[page]
}

pub fn find<'a>(boxes: &'a [PlacedBox], id: &str) -> &'a PlacedBox {
    boxes
        .iter()
        .find(|b| b.id.as_deref() == Some(id))
        .unwrap_or_else(|| panic!("no box for id `{id}`"))
}

#[test]
fn box_pages_parallel_the_document_and_index_every_item() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        id: keyed
        box: { w: 50, h: 20 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    assert_eq!(out.boxes.pages.len(), out.document.pages.len());
    let boxes = page_boxes(&out, 0);
    // BOTH rects are recorded — the id-carrying one keeps its id,
    // the id-less one is addressable by its structural path alone.
    assert_eq!(boxes.len(), 2);
    assert_eq!(boxes[0].id.as_deref(), Some("keyed"));
    assert_eq!(boxes[0].path, "sections.body.items[0]");
    assert_eq!(boxes[1].id, None);
    assert_eq!(boxes[1].path, "sections.body.items[1]");
}

#[test]
fn flow_placement_includes_cursor_and_margins() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 10, y: 100, w: 400, h: 600 }
    gap: 5
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 20 }
      - type: text
        id: greeting
        text: hello
        box: { w: 200, padding: { top: 4, left: 6 }, margin: { top: 8 } }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let b = find(page_boxes(&out, 0), "greeting");
    // Border box: cursor 100 + 20 (rect) + 5 (gap) + 8 (top margin).
    assert_eq!((b.border.x, b.border.y), (10.0, 133.0));
    assert_eq!(b.border.w, 200.0);
    // One 10pt line + 4pt top padding = 14pt border height.
    assert_eq!(b.border.h, 14.0);
    // Content box insets by the padding.
    assert_eq!((b.content.x, b.content.y), (16.0, 137.0));
    assert_eq!((b.content.w, b.content.h), (194.0, 10.0));
}

#[test]
fn absolute_and_container_children_report_absolute_positions() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        id: outer
        box: { x: 20, y: 30, w: 200, padding: { top: 10 } }
        items:
          - type: rect
            style: { borderWidth: 1 }
            id: inner
            box: { y: 5, w: 100, h: 40 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let boxes = page_boxes(&out, 0);
    let outer = find(boxes, "outer");
    // Auto height: child bottom (5 + 40) + top padding 10.
    assert_eq!(
        (
            outer.border.x,
            outer.border.y,
            outer.border.w,
            outer.border.h
        ),
        (20.0, 30.0, 200.0, 55.0)
    );
    assert_eq!((outer.content.y, outer.content.h), (40.0, 45.0));
    let inner = find(boxes, "inner");
    // Container origin 30 + padding 10 + child y 5.
    assert_eq!((inner.border.x, inner.border.y), (20.0, 45.0));
    // A rect's content box equals its border box (padding is ignored).
    assert_eq!(inner.content, inner.border);
}

#[test]
fn band_items_report_boxes_on_every_page() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: page_number
        id: pageno
        box: { x: 0, y: 10, w: 100, h: 20 }
        format: "{page}"
  body:
    type: flow
    box: { x: 0, y: 50, w: 400, h: 100 }
    gap: 0
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 80 }
      - type: rect
        style: { borderWidth: 1 }
        id: tall
        box: { w: 50, h: 80 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    assert_eq!(out.document.pages.len(), 2);
    // The page number is recorded on both pages; the paginated rect only
    // on page 2, at the region top.
    assert_eq!(find(page_boxes(&out, 0), "pageno").border.y, 10.0);
    assert_eq!(find(page_boxes(&out, 1), "pageno").border.y, 10.0);
    assert!(page_boxes(&out, 0)
        .iter()
        .all(|b| b.id.as_deref() != Some("tall")));
    assert_eq!(find(page_boxes(&out, 1), "tall").border.y, 50.0);
}

#[test]
fn repeat_cells_yield_one_placement_per_element() {
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
        grid: { columns: 2 }
        cell:
          id: card
          box: { padding: { top: 5 } }
          items:
            - type: text
              id: code
              data: { key: v }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "arr": [ { "v": "a" }, { "v": "b" } ] }),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let boxes = page_boxes(&out, 0);
    // Both the cell id and its child id appear once per bound element.
    let cards: Vec<_> = boxes
        .iter()
        .filter(|b| b.id.as_deref() == Some("card"))
        .collect();
    let codes: Vec<_> = boxes
        .iter()
        .filter(|b| b.id.as_deref() == Some("code"))
        .collect();
    assert_eq!((cards.len(), codes.len()), (2, 2));
    // 2-column grid: slots start at x = 0 and x = 100.
    assert_eq!(cards[0].border.x, 0.0);
    assert_eq!(cards[1].border.x, 100.0);
    // The child sits below the cell's 5pt top padding.
    assert_eq!(codes[0].border.y, 5.0);
}

#[test]
fn table_id_yields_one_fragment_box() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        id: lines
        data: { key: rows }
        columns:
          - label: Name
            data: { key: name }
            width: 100
"#,
        json!({ "rows": [ { "name": "a" } ] }),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    // The table's id is addressable — one fragment covering header + row
    // on this single page (pagination and per-cell column boxes are
    // exercised in table/boxes.rs; here id-less column cells also emit).
    let frag = find(page_boxes(&out, 0), "lines");
    assert_eq!(frag.path, "sections.body.items[0]");
    assert_eq!(
        (frag.border.x, frag.border.w),
        (0.0, 100.0),
        "fragment spans the columns"
    );
    assert_eq!(
        (frag.border.y, frag.border.h),
        (0.0, 48.0),
        "header 24 + one 24pt row"
    );
}

#[test]
fn qr_and_list_items_are_indexed_by_id() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 400 }
    items:
      - type: qr_code
        id: verify
        box: { w: 40, h: 40 }
        text: SHOJIKU
      - type: list
        id: notes
        box: { w: 100 }
        data: { key: notes }
"#,
        json!({ "notes": ["a", "b"] }),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let boxes = page_boxes(&out, 0);
    let qr = find(boxes, "verify");
    assert_eq!((qr.border.w, qr.border.h), (40.0, 40.0));
    let list = find(boxes, "notes");
    // The list stacks below the 40pt QR; two entries at the default
    // 10pt/1.4 line height give the auto height.
    assert_eq!(list.border.y, 40.0);
    assert_eq!(list.border.w, 100.0);
    assert_eq!(list.border.h, 28.0);
}
