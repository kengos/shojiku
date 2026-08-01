//! The `repeat_flow` item's own per-page box-index fragments: cards land
//! via the flow layouter, so same-page cards merge into one span (the
//! inter-card gap absorbed) and each page it spans gets one fragment at
//! the item path.

use crate::common::*;
use shojiku_layout::PlacedBox;

fn card_frags(out: &shojiku_layout::LayoutOutput, page: usize) -> Vec<&PlacedBox> {
    out.boxes.pages[page]
        .iter()
        .filter(|b| b.id.as_deref() == Some("cards"))
        .collect()
}

#[test]
fn same_page_cards_merge_into_one_fragment_absorbing_the_gap() {
    // Three 50pt cards, 5pt apart: 0-50, 55-105, 110-160. The fragment
    // spans the whole run (region x/width), gaps included.
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        id: cards
        data: { key: cards }
        gap: 5
        item:
          box: { h: 50 }
          items:
            - type: text
              text: x
"#,
        json!({ "cards": [{}, {}, {}] }),
    );
    let frags = card_frags(&out, 0);
    assert_eq!(frags.len(), 1);
    assert_eq!(frags[0].path, "sections.body.items[0]");
    assert_eq!(
        (
            frags[0].border.x,
            frags[0].border.y,
            frags[0].border.w,
            frags[0].border.h
        ),
        (0.0, 0.0, 400.0, 160.0)
    );
    assert_eq!(frags[0].content, frags[0].border);
}

#[test]
fn cards_across_pages_emit_one_fragment_each() {
    // Region 120pt: cards 0-50 and 55-105 fit page 0; the third (110-160)
    // breaks to page 1 at 0-50.
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 120 }
    items:
      - type: repeat_flow
        id: cards
        data: { key: cards }
        gap: 5
        item:
          box: { h: 50 }
          items:
            - type: text
              text: x
"#,
        json!({ "cards": [{}, {}, {}] }),
    );
    assert_eq!(out.document.pages.len(), 2);
    let (p0, p1) = (card_frags(&out, 0), card_frags(&out, 1));
    assert_eq!((p0.len(), p1.len()), (1, 1));
    assert_eq!((p0[0].border.y, p0[0].border.h), (0.0, 105.0));
    assert_eq!((p1[0].border.y, p1[0].border.h), (0.0, 50.0));
}

#[test]
fn page_cap_truncation_keeps_fragments_for_placed_cards_only() {
    // Full-page cards past MAX_PAGES exhaust the cap mid-array: every page
    // that received a card keeps its fragment, and the never-placed trailing
    // cards add none (the repeat side has the mirror test).
    let cards: Vec<Value> = (0..MAX_PAGES + 2).map(|_| json!({})).collect();
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        id: cards
        data: { key: cards }
        item:
          box: { h: 400 }
          items: []
"#,
        json!({ "cards": cards }),
    );
    assert!(out.diagnostics.iter().any(|d| d.code == "page_overflow"));
    assert_eq!(out.document.pages.len(), MAX_PAGES);
    let frags = out
        .boxes
        .pages
        .iter()
        .flatten()
        .filter(|b| b.id.as_deref() == Some("cards"))
        .count();
    assert_eq!(frags, MAX_PAGES);
}
