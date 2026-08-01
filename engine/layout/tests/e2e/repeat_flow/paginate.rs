//! Flow-repeat pagination: card-by-card page breaks, whole-card keeps,
//! oversized cards, and the page-cap early exit.

use crate::common::*;

#[test]
fn repeat_flow_paginates_card_by_card() {
    let cards: Vec<_> = (1..=10)
        .map(|i| json!({"label": format!("c{i}")}))
        .collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        data: { key: cards }
        item:
          box: { h: 100 }
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cards": cards }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // 100pt cards in a 400pt region: 4 + 4 + 2.
    assert_eq!(doc.pages.len(), 3);
    assert_eq!(text_blocks(&doc.pages[0]).len(), 4);
    assert_eq!(text_blocks(&doc.pages[1]).len(), 4);
    assert_eq!(text_blocks(&doc.pages[2]).len(), 2);
    assert!(all_text(&doc.pages[0]).contains("c1"));
    assert!(all_text(&doc.pages[2]).contains("c10"));
}

#[test]
fn repeat_flow_card_that_does_not_fit_moves_whole_to_the_next_page() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 350 }
      - type: repeat_flow
        data: { key: cards }
        item:
          box: { h: 100 }
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cards": [{"label": "A"}] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // 100pt does not fit under the 350pt rect; the card keeps together
    // on a fresh page instead of splitting.
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(cell_pos(&doc.pages[1], "A"), (0.0, 0.0));
}

#[test]
fn repeat_flow_card_taller_than_the_region_overflows_with_warning() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        data: { key: cards }
        item:
          box: { h: 500 }
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cards": [{"label": "A"}] }),
    );
    assert!(diags.iter().any(|d| d.code == "section_overflow"));
    assert!(all_text(&doc.pages[0]).contains("A"));
}

#[test]
fn repeat_flow_stops_at_the_page_cap_with_one_overflow_error() {
    // 502 full-page cards exhaust MAX_PAGES (500); the loop must stop
    // building card atoms once the layouter is truncated.
    let cards: Vec<_> = (0..502).map(|_| json!({})).collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        data: { key: cards }
        item:
          box: { h: 400 }
          items: []
"#,
        json!({ "cards": cards }),
    );
    assert_eq!(doc.pages.len(), 500);
    assert_eq!(
        diags.iter().filter(|d| d.code == "page_overflow").count(),
        1
    );
}
