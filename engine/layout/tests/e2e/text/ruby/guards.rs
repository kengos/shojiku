//! Horizontal ruby guards: unmatched bases, clip wrapping, skipped
//! malformed entries, and the hostile entry-list bounds — the horizontal
//! mirrors of the vertical guard suite.

use super::{ruby_blocks, tmpl};
use crate::common::*;

#[test]
fn an_unmatched_base_warns_and_later_entries_still_apply() {
    let yaml = tmpl(
        "吾輩は猫",
        "          - { base: 犬, text: いぬ }\n          - { base: 猫, text: ねこ }",
        "",
        "",
    );
    let (doc, diags) = run(&yaml, json!({}));
    let missing = diags
        .iter()
        .find(|d| d.code == "ruby_base_not_found")
        .expect("warns");
    assert!(missing.message.contains("犬"), "{}", missing.message);
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 1);
    assert_eq!(rubies[0].lines[0].text, "ねこ");
}

#[test]
fn readings_ride_inside_a_clip_wrapper() {
    // A definite height + `textOverflow: clip` wraps the block in a
    // `Clip`; the readings must clip with it (never drawn outside).
    let yaml = tmpl(
        "吾輩は猫",
        "          - { base: 吾輩, text: わがはい }",
        "",
        ", textOverflow: clip",
    )
    .replace("box: { w: 200 }", "box: { w: 200, h: 10 }");
    let (doc, _d) = run(&yaml, json!({}));
    // The flat helper misses clipped items: everything moved inside.
    assert!(text_blocks(&doc.pages[0]).is_empty());
    let clip_texts: usize = doc.pages[0]
        .items
        .iter()
        .map(|i| match i {
            LayoutItem::Clip(c) => c
                .items
                .iter()
                .filter(|ci| matches!(ci, LayoutItem::Text(_)))
                .count(),
            _ => 0,
        })
        .sum();
    assert_eq!(clip_texts, 2, "main block + reading, both clipped");
}

#[test]
fn empty_entries_are_skipped_without_readings() {
    let yaml = tmpl(
        "吾輩",
        "          - { base: \"\", text: よみ }\n          - { base: 吾輩, text: \"\" }",
        "",
        "",
    );
    let (doc, _) = run(&yaml, json!({}));
    assert!(ruby_blocks(&doc.pages[0]).is_empty());
}

#[test]
fn entries_past_the_cap_are_bounded() {
    // 300 entries against a short text: layout applies at most the cap
    // and stays linear — the run completing (with warnings) is the test.
    let entries: String = (0..300)
        .map(|_| "          - { base: 猫, text: ねこ }\n".to_string())
        .collect();
    let yaml = tmpl("猫", entries.trim_end(), "", "");
    let (doc, diags) = run(&yaml, json!({}));
    assert_eq!(ruby_blocks(&doc.pages[0]).len(), 1);
    assert!(diags.iter().any(|d| d.code == "ruby_base_not_found"));
}

#[test]
fn an_over_long_base_is_skipped_and_the_scan_stays_bounded() {
    // The needle cap on the horizontal path: an over-cap base never
    // reaches the substring scan; the sane entry still applies.
    let long_base = "あ".repeat(65);
    let content = "あ".repeat(400);
    let entries = format!(
        "          - {{ base: \"{long_base}\", text: よみ }}\n          - {{ base: あ, text: よ }}"
    );
    let yaml = tmpl(&content, &entries, "", "");
    let (doc, _) = run(&yaml, json!({}));
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 1);
    assert_eq!(rubies[0].lines[0].text, "よ");
}
