//! `type: page_break` in the flow walk: explicit breaks, fresh-page
//! collapse, and non-flow rejection.

use crate::common::*;

#[test]
fn page_break_starts_the_next_item_on_a_fresh_page() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 500 }
    items:
      - type: text
        text: first
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: page_break
      - type: text
        text: second
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(line_texts(text_blocks(&doc.pages[0])[0]), vec!["first"]);
    let second = text_blocks(&doc.pages[1])[0];
    assert_eq!(line_texts(second), vec!["second"]);
    // The continuation starts at the region top (no stale gap).
    assert_eq!(second.lines[0].y, 0.0);
}

#[test]
fn page_breaks_on_fresh_pages_collapse_to_nothing() {
    // Leading break + a double break: neither may mint a blank page.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 500 }
    items:
      - type: page_break
      - type: text
        text: first
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: page_break
      - type: page_break
      - type: text
        text: second
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert_eq!(doc.pages.len(), 2, "no blank pages");
    assert_eq!(line_texts(text_blocks(&doc.pages[0])[0]), vec!["first"]);
    assert_eq!(line_texts(text_blocks(&doc.pages[1])[0]), vec!["second"]);
}

#[test]
fn page_break_outside_a_flow_warns_and_is_skipped() {
    // Bands, absolute bodies, and containers (which repeat cells share)
    // have no pagination cursor to break.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: page_break
  body:
    type: absolute
    items:
      - type: page_break
      - type: container
        box: { x: 0, y: 0, w: 100, h: 50 }
        items:
          - type: page_break
"#,
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1);
    for code in [
        "page_break_in_band",
        "page_break_in_absolute_body",
        "page_break_in_container",
    ] {
        assert!(diags.iter().any(|d| d.code == code), "missing {code}");
    }
}
