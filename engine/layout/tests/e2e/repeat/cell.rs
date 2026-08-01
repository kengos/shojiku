//! Imposition cells end to end: data scoping, style cascade, cell
//! box insets, and page interaction.

use crate::common::*;

#[test]
fn repeat_cell_interpolates_element_fields() {
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: text
              text: "No. {label}"
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "42"}] }),
    );
    assert!(all_text(&doc.pages[0]).contains("No. 42"));
}

#[test]
fn repeat_cell_style_cascades_and_percent_resolves_against_slot() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 1 }
        cell:
          style: { fontSize: 20 }
          items:
            - type: text
              box: { x: "50%", y: 0 }
              data: { key: label }
              style: { lineHeight: 1.0 }
            - type: rect
              box: { x: "0%", y: "50%", w: "50%", h: "25%" }
              style: { backgroundColor: "#eeeeee" }
"##,
        json!({ "cells": [{"label": "A"}, {"label": "B"}] }),
    );
    // A definite (slot-filling) cell height means `%` children resolve
    // cleanly — no `percent_of_auto` (indeed no diagnostics at all).
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let blocks = text_blocks(&doc.pages[0]);
    assert!(
        blocks.iter().all(|b| b.font_size == 20.0),
        "cell fontSize cascades"
    );
    let a = blocks.iter().find(|b| b.lines[0].text == "A").expect("A");
    assert_eq!(a.lines[0].x, 100.0); // 50% of the 200-wide slot
                                     // slot is 200×400; rect w 50% = 100, h 25% = 100.
    let rects = rect_shapes(&doc.pages[0]);
    assert!(rects
        .iter()
        .any(|r| (r.w - 100.0).abs() < 1e-9 && (r.h - 100.0).abs() < 1e-9));
}

#[test]
fn repeat_cell_box_insets_within_the_slot() {
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 1 }
        cell:
          box: { x: 10, y: 15, w: 100, h: 80 }
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "A"}] }),
    );
    // The explicit cell box offsets the content by (10, 15) from the slot.
    assert_eq!(cell_pos(&doc.pages[0], "A"), (10.0, 15.0));
}

#[test]
fn repeat_after_content_breaks_to_a_fresh_page() {
    let (doc, _diags) = run(
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
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({ "cells": [{"label": "A"}] }),
    );
    assert_eq!(doc.pages.len(), 2);
    assert!(all_text(&doc.pages[0]).contains("intro"));
    assert!(all_text(&doc.pages[1]).contains("A"));
}

#[test]
fn content_after_a_repeat_starts_a_new_page() {
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 1, rows: 1 }
        cell:
          items:
            - type: text
              data: { key: label }
      - type: text
        text: outro
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "A"}] }),
    );
    assert_eq!(doc.pages.len(), 2);
    assert!(all_text(&doc.pages[0]).contains("A"));
    assert!(all_text(&doc.pages[1]).contains("outro"));
}
