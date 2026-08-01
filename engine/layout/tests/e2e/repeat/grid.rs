//! Imposition grids end to end: tiling order, direction,
//! pagination, and gaps.

use crate::common::*;

#[test]
fn repeat_tiles_a_row_major_grid() {
    // 2×2, no gap, 400×400 region → four 200×200 slots, filled left-to-
    // right then top-to-bottom.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "A"}, {"label": "B"}, {"label": "C"}, {"label": "D"}] }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(doc.pages.len(), 1);
    assert_eq!(cell_pos(&doc.pages[0], "A"), (0.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "B"), (200.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 200.0));
    assert_eq!(cell_pos(&doc.pages[0], "D"), (200.0, 200.0));
}

#[test]
fn repeat_column_direction_fills_down_first() {
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
        grid: { columns: 2, rows: 2, direction: column }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "A"}, {"label": "B"}, {"label": "C"}, {"label": "D"}] }),
    );
    // Column-major: A,B fill the left column top-down; C,D the right.
    assert_eq!(cell_pos(&doc.pages[0], "A"), (0.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "B"), (0.0, 200.0));
    assert_eq!(cell_pos(&doc.pages[0], "C"), (200.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "D"), (200.0, 200.0));
}

#[test]
fn repeat_paginates_when_the_grid_fills() {
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
        grid: { columns: 2, rows: 2 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [
            {"label": "A"}, {"label": "B"}, {"label": "C"},
            {"label": "D"}, {"label": "E"}, {"label": "F"}
        ]}),
    );
    // 4 cells/page → 2 pages (4 + 2). The fifth cell resets to the grid top.
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(text_blocks(&doc.pages[0]).len(), 4);
    assert_eq!(text_blocks(&doc.pages[1]).len(), 2);
    assert_eq!(cell_pos(&doc.pages[1], "E"), (0.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[1], "F"), (200.0, 0.0));
}

#[test]
fn repeat_gaps_shrink_the_slots() {
    // 420×410 region, 2×2 with a 20pt column gap and 10pt row gap →
    // 200×200 slots; the second column starts at 200+20.
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 420, h: 410 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 2, columnGap: 20, rowGap: 10 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "A"}, {"label": "B"}, {"label": "C"}, {"label": "D"}] }),
    );
    assert_eq!(cell_pos(&doc.pages[0], "B"), (220.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 210.0));
}
