//! Flow-repeat stacking: cursor placement, gap, element scoping, style
//! cascade, and the per-instance box index.

use crate::common::*;

#[test]
fn repeat_flow_stacks_cards_with_gap_at_exact_positions() {
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
        gap: 5
        item:
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cards": [{"label": "A"}, {"label": "B"}, {"label": "C"}] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // Auto-height cards of one 10pt line each, 5pt apart: 0, 15, 30.
    assert_eq!(cell_pos(&doc.pages[0], "A"), (0.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "B"), (0.0, 15.0));
    assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 30.0));
}

#[test]
fn repeat_flow_percent_gap_resolves_against_region_height() {
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
        gap: "10%"
        item:
          box: { h: 50 }
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cards": [{"label": "A"}, {"label": "B"}] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // 10% of the 400pt region = 40pt gap: 0, then 50 + 40 = 90.
    assert_eq!(cell_pos(&doc.pages[0], "B"), (0.0, 90.0));
}

#[test]
fn repeat_flow_starts_at_the_cursor_not_a_fresh_page() {
    // The differentiator from the n-up `repeat`, which always breaks to
    // a fresh page after content.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        text: intro
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: repeat_flow
        data: { key: cards }
        item:
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cards": [{"label": "A"}] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(doc.pages.len(), 1);
    assert_eq!(cell_pos(&doc.pages[0], "A"), (0.0, 10.0));
}

#[test]
fn repeat_flow_cards_are_element_scoped_like_repeat_cells() {
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
          items:
            - type: text
              text: "No. {code} / {name}"
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cards": [
            {"code": "1", "name": "first"},
            {"code": "2", "name": "second"},
        ] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let text = all_text(&doc.pages[0]);
    assert!(text.contains("No. 1 / first"), "{text}");
    assert!(text.contains("No. 2 / second"), "{text}");
}

#[test]
fn repeat_flow_card_style_cascades_and_decoration_draws() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        data: { key: cards }
        item:
          box: { padding: 10 }
          style: { fontSize: 20, backgroundColor: "#eeeeee" }
          items:
            - type: text
              data: { key: label }
              style: { lineHeight: 1.0 }
"##,
        json!({ "cards": [{"label": "A"}] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(blocks[0].font_size, 20.0, "card style cascades");
    // Padding insets the text; the background rect covers the border box
    // (20pt line + 2×10pt padding).
    assert_eq!(cell_pos(&doc.pages[0], "A"), (10.0, 10.0));
    let rects = rect_shapes(&doc.pages[0]);
    assert!(
        rects
            .iter()
            .any(|r| r.fill.is_some() && (r.h - 40.0).abs() < 1e-9),
        "card decoration: {rects:?}"
    );
}

#[test]
fn repeat_flow_card_id_lands_one_box_per_instance() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        data: { key: cards }
        gap: 5
        item:
          id: card
          box: { h: 30 }
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cards": [{"label": "A"}, {"label": "B"}] }),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let cards: Vec<_> = out.boxes.pages[0]
        .iter()
        .filter(|b| b.id.as_deref() == Some("card"))
        .collect();
    assert_eq!(cards.len(), 2, "one placement per element");
    assert_eq!(cards[0].border.y, 0.0);
    assert_eq!(cards[1].border.y, 35.0);
}
