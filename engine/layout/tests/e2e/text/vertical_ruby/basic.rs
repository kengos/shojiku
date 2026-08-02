//! Vertical ruby happy paths: placement beside the base run, in-order
//! matching, cross-column splits, shrink-to-fit, and `rubySize`.

use super::{ruby_blocks, tmpl};
use crate::common::*;
use shojiku_core::TextOrientation;

#[test]
fn a_reading_attaches_right_of_its_base_run() {
    let yaml = tmpl("吾輩は猫", "          - { base: 吾輩, text: わがはい }", "");
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let page = &doc.pages[0];
    let base = text_blocks(page)[0];
    let ruby = ruby_blocks(page)[0];
    // Default size: half the block's 10pt; an upright vertical column.
    assert_eq!(ruby.font_size, 5.0);
    assert_eq!(ruby.vertical, Some(TextOrientation::Upright));
    assert_eq!(ruby.lines.len(), 1);
    assert_eq!(ruby.lines[0].text, "わがはい");
    // Right of the base column's em cell: column left (190) + col_w/2
    // (5) + fontSize/2 (5) = 200.
    assert!((ruby.lines[0].x - (base.lines[0].x + 10.0)).abs() < 0.01);
    // 吾輩 spans the column's first 20pt; the 4×5pt reading fills it.
    assert!((ruby.lines[0].y - base.lines[0].y).abs() < 0.01);
    assert!((ruby.lines[0].width - 20.0).abs() < 0.01);
}

#[test]
fn entries_match_in_order_without_overlap() {
    let yaml = tmpl(
        "ああ",
        "          - { base: あ, text: い }\n          - { base: あ, text: う }",
        "",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 2);
    // First occurrence then the second: readings centered per 10pt cell.
    assert_eq!(rubies[0].lines[0].text, "い");
    assert_eq!(rubies[1].lines[0].text, "う");
    assert!(rubies[1].lines[0].y > rubies[0].lines[0].y);
}

#[test]
fn a_base_wrapping_columns_splits_the_reading() {
    // 20pt columns → two chars each: columns 吾輩 / は. The base 輩は
    // crosses the boundary, so the reading splits proportionally (2+1).
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "吾輩は"
        box: { w: 200, h: 20 }
        style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
        ruby:
          - { base: 輩は, text: はいわ }
"#;
    let (doc, _) = run(yaml, json!({}));
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 2);
    assert_eq!(rubies[0].lines[0].text, "はい");
    assert_eq!(rubies[1].lines[0].text, "わ");
    // The second slice rides the NEXT column (10pt further left).
    assert!(rubies[0].lines[0].x - rubies[1].lines[0].x - 10.0 < 0.01);
}

#[test]
fn an_over_long_reading_shrinks_to_the_floor_and_warns() {
    // Base 吾 = one 10pt cell; the 4-char reading at 5pt (20pt) shrinks
    // linearly to 2.5 → floored at 4pt → still 16pt > 10pt → warns.
    let yaml = tmpl("吾は", "          - { base: 吾, text: わがはい }", "");
    let (doc, diags) = run(&yaml, json!({}));
    let ruby = ruby_blocks(&doc.pages[0])[0];
    assert_eq!(ruby.font_size, 4.0);
    assert!(diags.iter().any(|d| d.code == "ruby_overflow"));
}

#[test]
fn an_authored_ruby_size_wins_over_the_default() {
    let yaml = tmpl(
        "吾輩は猫",
        "          - { base: 吾輩, text: わが }",
        "\n        rubySize: 8",
    );
    let (doc, _) = run(&yaml, json!({}));
    assert_eq!(ruby_blocks(&doc.pages[0])[0].font_size, 8.0);
}

#[test]
fn readings_clip_with_their_block_under_text_overflow_clip() {
    // A clipped block keeps its readings inside the Clip wrapper.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "吾輩は猫である名前はまだ無い"
        box: { w: 20, h: 40 }
        style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl, textOverflow: clip }
        ruby:
          - { base: 吾輩, text: わがはい }
"#;
    let (doc, _) = run(yaml, json!({}));
    let page = &doc.pages[0];
    // The flat helper sees nothing — block AND readings moved inside.
    assert!(ruby_blocks(page).is_empty());
    let clip = crate::clip::only_clip(page);
    let small = clip
        .items
        .iter()
        .filter_map(|i| match i {
            shojiku_layout::LayoutItem::Text(b) if b.font_size < 10.0 => Some(b),
            _ => None,
        })
        .count();
    assert_eq!(small, 1, "the reading rides inside the clip");
}

#[test]
fn a_short_reading_leaves_later_column_slices_empty() {
    // The base spans two columns but the 1-char reading rounds entirely
    // into the first slice; the empty second slice draws nothing.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "吾輩は"
        box: { w: 200, h: 20 }
        style: { fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
        ruby:
          - { base: 輩は, text: よ }
"#;
    let (doc, _) = run(yaml, json!({}));
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 1);
    assert_eq!(rubies[0].lines[0].text, "よ");
}
