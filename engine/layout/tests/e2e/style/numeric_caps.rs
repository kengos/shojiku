//! Upper bounds on the two font-metric style scalars: `fontSize` is the
//! one Length-shaped value the `MAX_RESOLVED_PT` guard never sees (the
//! cascade resolves it via `Length::resolve`, not `resolve_x`), and
//! `lineHeight` multiplies it. The caps are chosen so their PRODUCT —
//! the tallest line box the guards admit — is exactly `MAX_RESOLVED_PT`,
//! which is what the boundary test at the bottom pins.

use crate::common::*;

/// Pinned copies of the engine's caps, asserted as observable behavior.
const MAX_FONT_SIZE_PT: f64 = 1_000.0;
const MAX_LINE_HEIGHT: f64 = 1_000.0;

fn run_style(style: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: text
        text: aaa
        box: {{ x: 0, y: 0 }}
        style: {style}
"#
        ),
        json!({}),
    )
}

#[test]
fn a_font_size_past_the_cap_falls_back_to_the_default() {
    let (doc, diags) = run_style("{ fontSize: 1e300 }");
    assert!(
        diags.iter().any(|d| d.code == "font_size_out_of_range"),
        "{diags:?}"
    );
    // Pin the degraded VALUE, not merely that it warned.
    assert_eq!(text_blocks(&doc.pages[0])[0].font_size, 10.0);
}

#[test]
fn the_largest_admitted_font_size_passes_clean() {
    let (doc, diags) = run_style("{ fontSize: 1000 }");
    assert!(
        !diags.iter().any(|d| d.code == "font_size_out_of_range"),
        "{diags:?}"
    );
    assert_eq!(text_blocks(&doc.pages[0])[0].font_size, MAX_FONT_SIZE_PT);
}

#[test]
fn a_line_height_past_the_cap_falls_back_to_the_default() {
    let (doc, diags) = run_style("{ fontSize: 10, lineHeight: 1e300 }");
    assert!(
        diags.iter().any(|d| d.code == "line_height_out_of_range"),
        "{diags:?}"
    );
    // 10pt × the 1.4 fallback: the block still measures as one line.
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.font_size, 10.0);
    assert_eq!(block.lines.len(), 1);
}

#[test]
fn the_largest_admitted_line_height_passes_clean() {
    let (_doc, diags) = run_style("{ fontSize: 10, lineHeight: 1000 }");
    assert!(
        !diags.iter().any(|d| d.code == "line_height_out_of_range"),
        "{diags:?}"
    );
}

#[test]
fn both_caps_at_their_admitted_maximum_keep_the_geometry_finite() {
    // The boundary a clamp creates: 1000pt × 1000 is the tallest line box
    // the guards admit, and it is exactly `MAX_RESOLVED_PT`. Finite INPUT
    // does not make the arithmetic finite, so assert the emitted numbers
    // are finite rather than merely that layout returned.
    let (doc, diags) = run_style("{ fontSize: 1000, lineHeight: 1000 }");
    assert!(
        !diags.has_errors(),
        "the admitted maximum must not error: {diags:?}"
    );
    assert_eq!(
        MAX_FONT_SIZE_PT * MAX_LINE_HEIGHT,
        MAX_RESOLVED_PT,
        "the caps are chosen so their product is the resolved-length cap"
    );
    for page in &doc.pages {
        for block in text_blocks(page) {
            assert!(block.font_size.is_finite(), "font size {}", block.font_size);
            for line in &block.lines {
                assert!(line.x.is_finite(), "line x {}", line.x);
                assert!(line.y.is_finite(), "line y {}", line.y);
            }
        }
    }
}

#[test]
fn the_non_finite_arms_keep_their_original_codes() {
    // The cap is a NEW code; the pre-existing non-finite / non-positive
    // fallbacks must keep emitting `invalid_font_size` unchanged.
    let (_doc, negative) = run_style("{ fontSize: -5 }");
    assert!(
        negative.iter().any(|d| d.code == "invalid_font_size"),
        "{negative:?}"
    );
    assert!(
        !negative.iter().any(|d| d.code == "font_size_out_of_range"),
        "{negative:?}"
    );
    let (_doc, zero_lh) = run_style("{ lineHeight: 0 }");
    assert!(
        zero_lh.iter().any(|d| d.code == "invalid_line_height"),
        "{zero_lh:?}"
    );
}
