//! Item-level links: static/interpolated URLs on text and image items,
//! element scoping inside `repeat` cells, and pagination.

use crate::common::*;

fn flow_page(items: &str) -> String {
    format!(
        "page: {{ margin: 0 }}\nsections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 400, h: 400 }}\n    items:\n{items}"
    )
}

#[test]
fn text_link_lands_on_the_block() {
    let (doc, diags) = run(
        &flow_page(
            "      - type: text\n        text: shop\n        link: { url: \"https://example.com\" }\n",
        ),
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(blocks[0].link.as_deref(), Some("https://example.com"));
}

#[test]
fn link_url_interpolates_params() {
    let (doc, _diags) = run(
        &flow_page(
            "      - type: text\n        text: order\n        link: { url: \"https://example.com/orders/{code}\" }\n",
        ),
        json!({ "code": "A-42" }),
    );
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(
        blocks[0].link.as_deref(),
        Some("https://example.com/orders/A-42")
    );
}

#[test]
fn repeat_cell_links_are_element_scoped() {
    let (doc, _diags) = run(
        &flow_page(
            "      - type: repeat\n        data: { key: tickets }\n        grid: { columns: 2, rows: 1 }\n        cell:\n          items:\n            - type: text\n              text: open\n              link: { url: \"https://example.com/t/{id}\" }\n              style: { fontSize: 10, lineHeight: 1.0 }\n",
        ),
        json!({ "tickets": [{"id": "x1"}, {"id": "x2"}] }),
    );
    let links: Vec<_> = text_blocks(&doc.pages[0])
        .iter()
        .filter_map(|b| b.link.as_deref())
        .collect();
    assert_eq!(
        links,
        ["https://example.com/t/x1", "https://example.com/t/x2"]
    );
}

#[test]
fn image_link_rides_the_draw_box() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        &flow_page(
            "      - type: image\n        box: { w: 40, h: 40 }\n        src: logo.png\n        link: { url: \"https://example.com/logo\" }\n",
        ),
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let images = image_shapes(&doc.pages[0]);
    assert_eq!(images[0].link.as_deref(), Some("https://example.com/logo"));
}

#[test]
fn flow_text_link_survives_pagination() {
    // 60 lines of 10pt text in a 400pt page: the block splits table-style
    // across pages, and every fragment must stay clickable.
    let long = (0..60).map(|_| "aaa").collect::<Vec<_>>().join("\\n");
    let (doc, _diags) = run(
        &flow_page(&format!(
            "      - type: text\n        text: \"{long}\"\n        link: {{ url: \"https://example.com\" }}\n        style: {{ fontSize: 10, lineHeight: 1.0 }}\n"
        )),
        json!({}),
    );
    assert!(doc.pages.len() > 1, "expected pagination");
    for page in &doc.pages {
        let blocks = text_blocks(page);
        assert_eq!(blocks[0].link.as_deref(), Some("https://example.com"));
    }
}
