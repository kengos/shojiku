//! The imposition grid's gaps end to end: the `gap` shorthand, the
//! axis keys overriding it, the per-axis `%` basis, and the CSS
//! non-negative clamp.

use crate::common::*;

/// A 2×2 grid over a 400×400 region, with whatever `grid:` spec is given.
fn grid(spec: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: repeat
        data: {{ key: cells }}
        grid: {{ columns: 2, rows: 2, {spec} }}
        cell:
          items:
            - type: text
              box: {{ x: 0, y: 0 }}
              data: {{ key: label }}
              style: {{ fontSize: 10, lineHeight: 1.0 }}
"#
        ),
        json!({ "cells": [{"label": "A"}, {"label": "B"}, {"label": "C"}, {"label": "D"}] }),
    )
}

#[test]
fn the_gap_shorthand_drives_both_axes() {
    // 400 − 20 = 380 over two slots → 190pt cells, so the second column
    // starts at 190 + 20 and the second row likewise.
    let (doc, diags) = grid("gap: 20");
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "A"), (0.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "B"), (210.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 210.0));
}

#[test]
fn an_axis_key_wins_over_the_shorthand_on_its_own_axis_only() {
    // columnGap 40 overrides the shorthand across; rows keep the 20.
    let (doc, _) = grid("gap: 20, columnGap: 40");
    assert_eq!(cell_pos(&doc.pages[0], "B"), (220.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 210.0));
}

#[test]
fn the_row_axis_key_wins_over_the_shorthand_too() {
    let (doc, _) = grid("gap: 20, rowGap: 40");
    assert_eq!(cell_pos(&doc.pages[0], "B"), (210.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 220.0));
}

#[test]
fn no_gap_key_at_all_keeps_the_slots_flush() {
    let (doc, _) = grid("direction: row");
    assert_eq!(cell_pos(&doc.pages[0], "B"), (200.0, 0.0));
    assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 200.0));
}

#[test]
fn a_percent_gap_resolves_against_its_own_axis() {
    // The region is square here, so a differing pair proves each axis
    // resolves against its own basis rather than sharing one.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 2, gap: "10%" }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0 }
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "cells": [{"label": "A"}, {"label": "B"}, {"label": "C"}, {"label": "D"}] }),
    );
    // 10% of the 400pt width = 40 → slots 180 wide, B at 220.
    assert_eq!(cell_pos(&doc.pages[0], "B"), (220.0, 0.0));
    // 10% of the 200pt height = 20 → slots 90 tall, C at 110.
    assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 110.0));
}

#[test]
fn a_negative_gap_clamps_to_zero_instead_of_overlapping_cells() {
    for spec in ["gap: -30", "columnGap: -30, rowGap: -30"] {
        let (doc, _) = grid(spec);
        assert_eq!(cell_pos(&doc.pages[0], "B"), (200.0, 0.0), "{spec}");
        assert_eq!(cell_pos(&doc.pages[0], "C"), (0.0, 200.0), "{spec}");
    }
}

#[test]
fn a_gap_wider_than_the_region_degenerates_without_panicking() {
    // The gaps consume the whole region: slots floor at zero rather than
    // going negative, and every cell still lands (stacked at the origin).
    let (doc, _) = grid("gap: \"400%\"");
    assert_eq!(doc.pages.len(), 1);
    assert_eq!(cell_pos(&doc.pages[0], "A"), (0.0, 0.0));
}

#[test]
fn a_gap_beyond_the_length_cap_degrades_through_the_resolve_guard() {
    // A hostile absolute length is caught by the shared resolve guard
    // (`length_out_of_range`) and drops to no gap — never a panic, never
    // an unbounded slot origin.
    let (doc, diags) = grid("gap: 100000000");
    assert!(
        diags
            .items
            .iter()
            .any(|d| d.code.as_str() == "length_out_of_range"),
        "{diags:?}"
    );
    assert_eq!(cell_pos(&doc.pages[0], "B"), (200.0, 0.0));
}
