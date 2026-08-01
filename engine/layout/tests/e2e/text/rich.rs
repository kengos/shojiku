//! Rich text spans (RT1) end to end, split by concern: run output
//! (`runs`), wrapping/pagination (`wrapping`), and guards/policy scope
//! (`guards`).

mod guards;
mod runs;
mod wrapping;

use crate::common::*;

/// The fixed-pitch face: every full-width glyph is exactly 1em, Latin
/// exactly 0.5em, so run geometry is byte-predictable.
const FIXED: &str = "biz-ud-gothic";

pub(super) fn fixed_ascent(size: f64) -> f64 {
    ja_store().get(FIXED).unwrap().ascent(size)
}

#[test]
fn oversized_cross_span_word_hard_breaks_per_char() {
    // One latin "word" spanning both spans, wider than the whole line:
    // hard-breaks per char like plain text (the shared engine's
    // hard-break path, exercised through the library build).
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        box: { w: 17 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10 }
        spans:
          - text: "aaaaa"
          - text: "aaaaa"
"#,
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    // Latin `a` is 0.5em = 5pt: 3 chars per 17pt line, nothing lost.
    assert!(block.lines.len() >= 3);
    let all: String = block.lines.iter().map(|l| l.text.clone()).collect();
    assert_eq!(all, "aaaaaaaaaa");
    assert!(block.lines.iter().all(|l| l.text.chars().count() <= 3));
}

#[test]
fn rich_item_id_lands_in_the_box_index() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        id: total
        box: { w: 100 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10 }
        spans:
          - text: "あ"
"#,
        json!({}),
    );
    let placed: Vec<_> = out.boxes.pages[0]
        .iter()
        .filter(|b| b.id.as_deref() == Some("total"))
        .collect();
    assert_eq!(placed.len(), 1);
    assert!((placed[0].border.w - 100.0).abs() < 1e-6);
    assert!((placed[0].border.h - 14.0).abs() < 1e-6);
}
