//! Vertical ruby guards: unmatched bases warn and continue, hostile
//! entry lists stay bounded, and a policy-handled (shrink-at-floor)
//! overflow still places whole with its readings.

use super::{ruby_blocks, tmpl};
use crate::common::*;

#[test]
fn an_unmatched_base_warns_and_later_entries_still_apply() {
    let yaml = tmpl(
        "吾輩は猫",
        "          - { base: 犬, text: いぬ }\n          - { base: 猫, text: ねこ }",
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
fn a_shrink_at_floor_ruby_block_places_whole_with_readings() {
    // `shrink` that still overflows at its floor warned
    // `vertical_text_overflow` (the paginator's `mark` check): the block is
    // policy-handled and places WHOLE — one page, readings drawn once.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "吾輩は猫である名前はまだ無い吾輩は猫である名前はまだ無い"
        box: { w: 9, h: 20 }
        style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl, textOverflow: shrink }
        ruby:
          - { base: 吾輩, text: わがはい }
"#;
    let (doc, diags) = run(yaml, json!({}));
    assert_eq!(
        doc.pages.len(),
        1,
        "policy-handled overflow never paginates"
    );
    assert!(diags.iter().any(|d| d.code == "vertical_text_overflow"));
    // The size-based `ruby_blocks` filter is useless post-shrink (the
    // MAIN block is small too); find the reading by its text.
    let readings = text_blocks(&doc.pages[0])
        .into_iter()
        .filter(|b| b.lines.iter().any(|l| l.text == "わがはい"))
        .count();
    assert_eq!(readings, 1);
}

#[test]
fn a_digit_base_under_active_combine_still_locates() {
    // 縦中横 merges "31" into ONE cell whose source range covers the
    // whole group; a ruby base of those digits still locates through it
    // (or would warn `ruby_base_not_found`) — never a panic.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "1月31日"
        box: { w: 200, h: 100 }
        style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl, textCombineUpright: { digits: 2 } }
        ruby:
          - { base: "31", text: さんいち }
"#;
    let (doc, diags) = run(yaml, json!({}));
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 1);
    assert_eq!(rubies[0].lines[0].text, "さんいち");
    // The base's cell sits below 1月 (two 10pt cells): the reading's
    // extent centers on that one combined cell.
    let r = &rubies[0].lines[0];
    assert!(r.y.is_finite() && r.width.is_finite());
}

#[test]
fn entries_past_the_cap_are_bounded() {
    // 300 entries against a short text: layout applies at most the cap
    // and stays linear — the run completing (with warnings) is the test.
    let entries: String = (0..300)
        .map(|_| "          - { base: 猫, text: ねこ }\n".to_string())
        .collect();
    let yaml = tmpl("猫", entries.trim_end(), "");
    let (doc, diags) = run(&yaml, json!({}));
    // The first entry matches; every later one warns base-not-found.
    assert_eq!(ruby_blocks(&doc.pages[0]).len(), 1);
    assert!(diags.iter().any(|d| d.code == "ruby_base_not_found"));
}

#[test]
fn empty_entries_are_skipped_without_readings() {
    let yaml = tmpl(
        "吾輩",
        "          - { base: \"\", text: よみ }\n          - { base: 吾輩, text: \"\" }",
        "",
    );
    let (doc, _) = run(&yaml, json!({}));
    assert!(ruby_blocks(&doc.pages[0]).is_empty());
}

#[test]
fn an_over_long_base_is_skipped_and_the_scan_stays_bounded() {
    // The needle cap: a template-supplied base longer than the entry cap
    // never reaches the substring scan (an unbounded needle over
    // params-driven content would be O(content × needle) per entry).
    // Repetitive content is the worst case for a partial-match needle.
    let long_base = "あ".repeat(65);
    let content = "あ".repeat(400);
    let yaml = format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: text
        text: "{content}"
        box: {{ w: 200, h: 100 }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }}
        ruby:
          - {{ base: "{long_base}", text: よみ }}
          - {{ base: あ, text: よ }}
"#
    );
    let (doc, _) = run(&yaml, json!({}));
    // The over-cap entry draws nothing; the sane entry still applies.
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 1);
    assert_eq!(rubies[0].lines[0].text, "よ");
}
