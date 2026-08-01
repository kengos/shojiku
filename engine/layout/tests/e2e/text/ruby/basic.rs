//! Horizontal ruby placement: readings above the base run's em band,
//! centered over its shaped extent, `rubySize`, the shrink floor, and
//! proportional splits across wrapped lines.

use super::{main_block, ruby_blocks, tmpl};
use crate::common::*;

#[test]
fn a_reading_sits_centered_above_its_base_run() {
    let yaml = tmpl(
        "吾輩は猫",
        "          - { base: 吾輩, text: わがはい }",
        "",
        "",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let base_line = &main_block(&doc.pages[0]).lines[0];
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 1);
    let r = &rubies[0].lines[0];
    assert_eq!(r.text, "わがはい");
    // Default size = half the base (5pt); the reading's bottom touches
    // the base line's em top (a plain line's em band starts AT its top).
    assert_eq!(rubies[0].font_size, 5.0);
    assert!((r.y - (base_line.y - 5.0)).abs() < 0.01, "y {}", r.y);
    // 吾輩 spans x 0..20 (two 1em cells); わがはい at 5pt is 20pt wide —
    // exactly the base extent, so it starts at the base's left edge.
    assert!((r.x - 0.0).abs() < 0.01, "x {}", r.x);
    assert!((r.width - 20.0).abs() < 0.01, "width {}", r.width);
}

#[test]
fn ruby_size_is_honored_when_it_fits() {
    let yaml = tmpl(
        "吾輩は猫",
        "          - { base: 吾輩は猫, text: よみ }",
        "\n        rubySize: 6",
        "",
    );
    let (doc, _d) = run(&yaml, json!({}));
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 1);
    assert_eq!(rubies[0].font_size, 6.0);
    // よみ at 6pt = 12pt, centered over the 40pt base run.
    let r = &rubies[0].lines[0];
    assert!((r.x - 14.0).abs() < 0.01, "x {}", r.x);
}

#[test]
fn an_over_long_reading_shrinks_to_the_floor_and_warns() {
    let yaml = tmpl(
        "吾輩は猫",
        "          - { base: 吾, text: ながいよみがな }",
        "",
        "",
    );
    let (doc, diags) = run(&yaml, json!({}));
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 1);
    // 7 chars over a 10pt base: even the 4pt floor overflows.
    assert_eq!(rubies[0].font_size, 4.0);
    assert!(diags.iter().any(|d| d.code == "ruby_overflow"));
}

#[test]
fn a_base_wrapping_two_lines_splits_the_reading_proportionally() {
    // w:40 wraps 吾輩は猫|である: base は猫であ = 2 chars on each line,
    // so the reading よみかた splits よみ|かた.
    let yaml = tmpl(
        "吾輩は猫である",
        "          - { base: は猫であ, text: よみかた }",
        "",
        "",
    )
    .replace("box: { w: 200 }", "box: { w: 40 }");
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    let main = main_block(&doc.pages[0]);
    assert_eq!(main.lines.len(), 2);
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 2);
    let (r0, r1) = (&rubies[0].lines[0], &rubies[1].lines[0]);
    assert_eq!(r0.text, "よみ");
    assert_eq!(r1.text, "かた");
    // Line 0: は猫 at x 20..40, よみ (10pt) centered → x 25; above line 0.
    assert!((r0.x - 25.0).abs() < 0.01, "x {}", r0.x);
    assert!((r0.y - (main.lines[0].y - 5.0)).abs() < 0.01);
    // Line 1: であ at x 0..20 → かた at x 5; above line 1 (y 20 − 5).
    assert!((r1.x - 5.0).abs() < 0.01, "x {}", r1.x);
    assert!((r1.y - (main.lines[1].y - 5.0)).abs() < 0.01);
}

#[test]
fn entries_match_in_order_without_overlapping() {
    let yaml = tmpl(
        "吾輩と吾輩",
        "          - { base: 吾輩, text: わが }\n          - { base: 吾輩, text: はい }",
        "",
        "",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 2);
    // First 吾輩 at x 0..20 → わが at 5; second at x 30..50 → はい at 35.
    assert!((rubies[0].lines[0].x - 5.0).abs() < 0.01);
    assert!((rubies[1].lines[0].x - 35.0).abs() < 0.01);
}
