//! `verticalAlign` on a vertical block: the CSS-logical column-stack
//! shift (top→right edge, middle→center, bottom→left edge), clamped so an
//! overflowing stack stays anchored right.

use super::tmpl;
use crate::common::*;

#[test]
fn middle_centers_the_column_stack() {
    // 15 cells in a 100pt-tall box → 2 columns (20pt) in a 200pt box:
    // slack 180, middle shift 90 → first column left = 190 − 90 = 100.
    let (doc, diags) = run(
        &tmpl(
            "あいうえおかきくけこさしすせそ",
            "w: 200, h: 100",
            ", verticalAlign: middle",
        ),
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 2);
    assert!(
        (block.lines[0].x - 100.0).abs() < 0.01,
        "{:?}",
        block.lines[0].x
    );
    assert!((block.lines[1].x - 90.0).abs() < 0.01);
}

#[test]
fn bottom_shifts_the_stack_to_the_left_edge() {
    // One 3-cell column: slack 190 → the column hugs the content left.
    let (doc, _d) = run(
        &tmpl("あいう", "w: 200, h: 100", ", verticalAlign: bottom"),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert!(
        (block.lines[0].x - 0.0).abs() < 0.01,
        "{:?}",
        block.lines[0].x
    );
}

#[test]
fn an_overflowing_clipped_stack_stays_anchored_right() {
    // 5 columns needed, box holds 2, clip + middle: negative slack clamps
    // the shift to 0, so the first column still sits at the right edge.
    let (doc, diags) = run(
        &tmpl(
            "あいうえおかきくけこさしすせそ",
            "w: 25, h: 30",
            ", textOverflow: clip, verticalAlign: middle",
        ),
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_style_ignored"), 0);
    let clip = crate::clip::only_clip(&doc.pages[0]);
    let block = clip
        .items
        .iter()
        .find_map(|i| match i {
            shojiku_layout::LayoutItem::Text(b) => Some(b),
            _ => None,
        })
        .expect("clipped block");
    assert!(
        (block.lines[0].x - 15.0).abs() < 0.01,
        "{:?}",
        block.lines[0].x
    );
}

/// Diagnostic count by code (local to the knob suites).
pub(super) fn count_code(diags: &shojiku_diagnostics::Diagnostics, code: &str) -> usize {
    diags.iter().filter(|d| d.code == code).count()
}
