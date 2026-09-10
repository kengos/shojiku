//! `PlacedBox.linked` — the box index's answer to "will a PDF link
//! annotation land here?", which is what lets a canvas show WHERE the
//! links are without opening every item.
//!
//! The flag is derived from the DRAWN items rather than from the authored
//! `link:`, so these cases are about the difference between the two: a URL
//! the gate rejected, a hidden item, a link that lives on one span of a
//! rich block, and an image buried inside a `fit: cover` clip.

use super::{find, page_boxes};
use crate::common::*;

fn flow_page(items: &str) -> String {
    format!(
        "page: {{ margin: 0 }}\nsections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 400, h: 400 }}\n    items:\n{items}"
    )
}

fn linked_flags(out: &LayoutOutput, page: usize) -> Vec<bool> {
    page_boxes(out, page).iter().map(|b| b.linked).collect()
}

#[test]
fn a_plain_text_item_reports_its_own_link() {
    let out = run_full(
        &flow_page(
            "      - type: text\n        id: cta\n        text: shop\n        link: { url: \"https://example.com\" }\n      - type: text\n        id: plain\n        text: no link here\n",
        ),
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let boxes = page_boxes(&out, 0);
    assert!(find(boxes, "cta").linked);
    assert!(!find(boxes, "plain").linked);
}

#[test]
fn a_link_free_document_never_serializes_the_key() {
    // The wire promise: adding this flag left the inspect envelope
    // byte-identical for every document that carries no link.
    let out = run_full(
        &flow_page("      - type: text\n        id: plain\n        text: hello\n"),
        json!({}),
    );
    let json = serde_json::to_string(&out.boxes).expect("serialize box index");
    assert!(
        !json.contains("linked"),
        "the flag must be skipped when false: {json}"
    );
}

#[test]
fn a_vertical_text_item_reports_its_link() {
    // The vertical plain path builds its own block; `linked` must not be a
    // horizontal-only property.
    let out = run_full(
        &flow_page(
            "      - type: text\n        id: v\n        text: たて\n        style: { writingMode: vertical_rl }\n        link: { url: \"https://example.com\" }\n",
        ),
        json!({}),
    );
    assert!(find(page_boxes(&out, 0), "v").linked);
}

#[test]
fn a_rich_item_is_linked_by_a_single_span() {
    // The case the flag cannot be finer-grained about: the box addresses
    // the ITEM, and one of its three spans carries the link.
    let out = run_full(
        &flow_page(
            "      - type: text\n        id: rich\n        spans:\n          - text: \"see the \"\n          - text: terms\n            link: { url: \"https://example.com/terms\" }\n          - text: \" please\"\n      - type: text\n        id: unrich\n        spans:\n          - text: nothing\n          - text: here\n",
        ),
        json!({}),
    );
    let boxes = page_boxes(&out, 0);
    assert!(find(boxes, "rich").linked);
    assert!(!find(boxes, "unrich").linked);
}

#[test]
fn a_rich_item_is_linked_by_its_block_level_url() {
    let out = run_full(
        &flow_page(
            "      - type: text\n        id: rich\n        link: { url: \"https://example.com\" }\n        spans:\n          - text: one\n          - text: two\n",
        ),
        json!({}),
    );
    assert!(find(page_boxes(&out, 0), "rich").linked);
}

#[test]
fn a_vertical_rich_item_is_linked_by_a_single_span() {
    // `vrich` is a separate builder from `rich`; it stamps its own box.
    let out = run_full(
        &flow_page(
            "      - type: text\n        id: vrich\n        style: { writingMode: vertical_rl }\n        spans:\n          - text: まえ\n          - text: 規約\n            link: { url: \"https://example.com/terms\" }\n",
        ),
        json!({}),
    );
    assert!(find(page_boxes(&out, 0), "vrich").linked);
}

#[test]
fn an_image_reports_its_link_inside_and_outside_a_clip() {
    // `fit: cover` wraps the shape in a `Clip`; the flag must read through
    // it exactly as the PDF annotation walk does.
    let assets = test_assets();
    for fit in ["contain", "cover"] {
        let out = run_full_assets(
            &flow_page(&format!(
                "      - type: image\n        id: logo\n        box: {{ w: 40, h: 20 }}\n        src: logo.png\n        fit: {fit}\n        link: {{ url: \"https://example.com/logo\" }}\n"
            )),
            json!({}),
            &assets,
        );
        assert!(find(page_boxes(&out, 0), "logo").linked, "fit: {fit}");
    }
    let out = run_full_assets(
        &flow_page(
            "      - type: image\n        id: logo\n        box: { w: 40, h: 20 }\n        src: logo.png\n",
        ),
        json!({}),
        &assets,
    );
    assert!(!find(page_boxes(&out, 0), "logo").linked);
}

#[test]
fn a_rejected_url_reports_no_link_and_still_warns() {
    // The security property: params are untrusted, layout drops a URL
    // outside the allowlist — and a box claiming a link the PDF will not
    // carry would tell the author the opposite.
    for url in ["javascript:alert(1)", "file:///etc/passwd", "   "] {
        let out = run_full(
            &flow_page(&format!(
                "      - type: text\n        id: bad\n        text: nope\n        link: {{ url: \"{url}\" }}\n"
            )),
            json!({}),
        );
        assert!(!find(page_boxes(&out, 0), "bad").linked, "url: {url}");
        assert!(!out.diagnostics.is_empty(), "expected a warning for {url}");
    }
}

#[test]
fn an_over_long_url_reports_no_link() {
    let url = format!("https://example.com/{}", "a".repeat(2100));
    let out = run_full(
        &flow_page(&format!(
            "      - type: text\n        id: bad\n        text: nope\n        link: {{ url: \"{url}\" }}\n"
        )),
        json!({}),
    );
    assert!(!find(page_boxes(&out, 0), "bad").linked);
    assert!(!out.diagnostics.is_empty(), "expected a length warning");
}

#[test]
fn a_hidden_item_reports_hidden_and_not_linked() {
    // `visible:` did not hold, so the drawn items were dropped and the PDF
    // carries no annotation — the box must not claim one.
    let out = run_full(
        &flow_page(
            "      - type: text\n        id: gone\n        text: shop\n        link: { url: \"https://example.com\" }\n        visible: { key: show }\n",
        ),
        json!({}),
    );
    let b = find(page_boxes(&out, 0), "gone");
    assert!(b.hidden);
    assert!(!b.linked);
}

#[test]
fn a_hidden_paginating_item_reports_hidden_and_not_linked() {
    // The `blank_since` path: a table pushes straight into the pages, so
    // hiding it is a before/after mark rather than an atom transform. Its
    // cell text is what would have carried the link.
    let long = (0..60).map(|_| "aaa").collect::<Vec<_>>().join("\\n");
    let out = run_full(
        &flow_page(&format!(
            "      - type: text\n        id: gone\n        text: \"{long}\"\n        link: {{ url: \"https://example.com\" }}\n        style: {{ fontSize: 10, lineHeight: 1.0 }}\n        visible: {{ key: show }}\n"
        )),
        json!({}),
    );
    for page in 0..out.document.pages.len() {
        for b in page_boxes(&out, page) {
            assert!(b.hidden, "page {page}: {b:?}");
            assert!(!b.linked, "page {page}: {b:?}");
        }
    }
}

#[test]
fn every_page_fragment_of_a_split_block_reports_linked() {
    // Each fragment carries its own placement; the flag has to ride all of
    // them, since the PDF puts an annotation on each fragment's lines.
    let long = (0..60).map(|_| "aaa").collect::<Vec<_>>().join("\\n");
    let out = run_full(
        &flow_page(&format!(
            "      - type: text\n        id: long\n        text: \"{long}\"\n        link: {{ url: \"https://example.com\" }}\n        style: {{ fontSize: 10, lineHeight: 1.0 }}\n"
        )),
        json!({}),
    );
    assert!(out.document.pages.len() > 1, "expected pagination");
    for page in 0..out.document.pages.len() {
        assert_eq!(linked_flags(&out, page), vec![true], "page {page} fragment");
    }
}

#[test]
fn repeat_elements_at_one_path_report_their_own_verdicts() {
    // The reason this cannot be computed from the DOCUMENT: both
    // placements share a structural path, and whether each is linked
    // depends on the element's own data.
    let out = run_full(
        &flow_page(
            "      - type: repeat\n        data: { key: tickets }\n        grid: { columns: 2, rows: 1 }\n        cell:\n          items:\n            - type: text\n              text: open\n              link: { url: \"{href}\" }\n              style: { fontSize: 10, lineHeight: 1.0 }\n",
        ),
        json!({ "tickets": [
            { "href": "https://example.com/t/1" },
            { "href": "javascript:alert(1)" }
        ] }),
    );
    let cells: Vec<_> = page_boxes(&out, 0)
        .iter()
        .filter(|b| b.path.contains("cell.items[0]"))
        .collect();
    assert_eq!(cells.len(), 2, "one placement per element: {cells:?}");
    assert_eq!(cells[0].path, cells[1].path, "the SAME structural path");
    assert_eq!(
        (cells[0].linked, cells[1].linked),
        (true, false),
        "each element's own verdict"
    );
}

#[test]
fn a_table_cell_box_is_never_linked() {
    // A cell takes no `link:` of its own; the text item inside it does.
    let out = run_full(
        &flow_page(
            "      - type: table\n        data: { key: rows }\n        cellPadding: 0\n        columns:\n          - width: 200\n            cell:\n              items:\n                - type: text\n                  id: inner\n                  text: shop\n                  link: { url: \"https://example.com\" }\n                  style: { fontSize: 10, lineHeight: 1.0 }\n",
        ),
        json!({ "rows": [{ "n": 1 }] }),
    );
    let boxes = page_boxes(&out, 0);
    assert!(find(boxes, "inner").linked);
    // A CELL's own placement ends at `columns[n]`; the text item inside it
    // continues `…columns[0].cell.items[0]`, which is the box that carries
    // the flag. Filtering on `columns[` alone catches both.
    let cells: Vec<_> = boxes
        .iter()
        .filter(|b| b.path.ends_with("columns[0]"))
        .collect();
    assert_eq!(cells.len(), 1, "one cell placement: {cells:?}");
    assert!(!cells[0].linked, "a cell box claims a link: {:?}", cells[0]);
}
