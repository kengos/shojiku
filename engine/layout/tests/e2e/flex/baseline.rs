//! `alignItems: baseline` rows: text baselines line up, no-text children
//! sit their bottom edge on the baseline, column direction falls back to
//! start, and auto margins still win.

use super::container_body;
use crate::common::*;

fn ascent(size: f64) -> f64 {
    ja_store().face(Some("biz-udp-gothic")).ascent(size)
}

#[test]
fn checkbox_bottom_sits_on_the_label_baseline() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 300, direction: row, gap: 6, alignItems: baseline }",
        "- type: checkbox\n  box: { w: 11, h: 11 }\n  checked: true\n- type: text\n  text: label\n  style: { fontSize: 11 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let frame = rect_shapes(&doc.pages[0])[0];
    let line = &text_blocks(&doc.pages[0])[0].lines[0];
    let text_baseline = line.y + ascent(11.0);
    let frame_bottom = frame.y + frame.h;
    assert!(
        (frame_bottom - text_baseline).abs() < 0.01,
        "frame bottom {frame_bottom} vs baseline {text_baseline}"
    );
}

#[test]
fn mixed_font_sizes_share_one_baseline() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 400, direction: row, gap: 8, alignItems: baseline }",
        "- type: text\n  box: { w: 100 }\n  text: small\n  style: { fontSize: 10 }\n- type: text\n  box: { w: 100 }\n  text: large\n  style: { fontSize: 20 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let blocks = text_blocks(&doc.pages[0]);
    let b_small = blocks[0].lines[0].y + ascent(10.0);
    let b_large = blocks[1].lines[0].y + ascent(20.0);
    assert!(
        (b_small - b_large).abs() < 0.01,
        "baselines differ: {b_small} vs {b_large}"
    );
    // The smaller text shifted DOWN to meet the deeper baseline.
    assert!(blocks[0].lines[0].y > blocks[1].lines[0].y);
}

#[test]
fn column_direction_baseline_behaves_like_start() {
    // Two definite-width rects in a column: baseline must not shift them
    // horizontally (the cross axis) — same x as alignItems: start.
    let base = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 100, h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 50, h: 10 }";
    let with = |align: &str| {
        container_body(
            &format!("{{ x: 0, y: 0, w: 300, direction: column, alignItems: {align} }}"),
            base,
        )
    };
    let (doc_b, diags) = run(&with("baseline"), json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let (doc_s, _) = run(&with("start"), json!({}));
    let xs = |doc: &LayoutDocument| {
        rect_shapes(&doc.pages[0])
            .iter()
            .map(|r| r.x)
            .collect::<Vec<_>>()
    };
    assert_eq!(xs(&doc_b), xs(&doc_s));
}

#[test]
fn cross_auto_margins_beat_baseline() {
    // The rect with `margin: { top: auto }` pushes to the row bottom
    // (h 40), ignoring baseline alignment; the text still baseline-sits
    // at the top since it defines the deepest baseline.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 300, h: 40, direction: row, gap: 6, alignItems: baseline }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 10, h: 10, margin: { top: auto } }\n- type: text\n  text: label\n  style: { fontSize: 11 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    assert!(
        (rect.y + rect.h - 40.0).abs() < 0.01,
        "auto margin pushed to the bottom, got y={}",
        rect.y
    );
}

#[test]
fn all_synthesized_baselines_align_bottoms() {
    // No text anywhere: every baseline is the bottom edge, so a baseline
    // row bottom-aligns mixed heights (CSS-consistent).
    let yaml = container_body(
        "{ x: 0, y: 0, w: 300, direction: row, gap: 6, alignItems: baseline }",
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 10, h: 24 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 10, h: 10 }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let rects = rect_shapes(&doc.pages[0]);
    let bottoms: Vec<f64> = rects.iter().map(|r| r.y + r.h).collect();
    assert!((bottoms[0] - bottoms[1]).abs() < 0.01, "{bottoms:?}");
}
