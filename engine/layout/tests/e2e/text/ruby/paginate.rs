//! Horizontal ruby under flow pagination: an auto-height ruby'd block
//! taller than the region splits at line boundaries and each fragment
//! carries ITS lines' readings, re-anchored at the fragment's own ys.

use super::ruby_blocks;
use crate::common::*;

#[test]
fn readings_ride_horizontal_fragments() {
    // w:40 wraps 15 chars into 4 lines (吾輩は猫|である名|前はまだ|無いよ)
    // of 20pt each; a 60pt region takes 3 lines per page → 2 pages.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 60 }
    items:
      - type: text
        text: "吾輩は猫である名前はまだ無いよ"
        box: { w: 40 }
        style: { fontSize: 10, lineHeight: 2.0, fontFamily: biz-ud-gothic }
        ruby:
          - { base: 吾輩, text: わがはい }
          - { base: 無い, text: ナイ }
"#;
    let (doc, diags) = run(yaml, json!({}));
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    assert_eq!(doc.pages.len(), 2);
    // Page 1 carries the first line's reading, above line 0 (y −5).
    let p1 = ruby_blocks(&doc.pages[0]);
    assert_eq!(p1.len(), 1);
    assert_eq!(p1[0].lines[0].text, "わがはい");
    assert!(
        (p1[0].lines[0].y - (-5.0)).abs() < 0.01,
        "{}",
        p1[0].lines[0].y
    );
    // Page 2's reading re-anchors above ITS first line (無い sits on the
    // 4th wrapped line = page 2's line 0): y = 0 − 5.
    let p2 = ruby_blocks(&doc.pages[1]);
    assert_eq!(p2.len(), 1);
    assert_eq!(p2[0].lines[0].text, "ナイ");
    assert!(
        (p2[0].lines[0].y - (-5.0)).abs() < 0.01,
        "{}",
        p2[0].lines[0].y
    );
    // 無い spans x 0..20 on its line → the 10pt reading centers at x 5.
    assert!(
        (p2[0].lines[0].x - 5.0).abs() < 0.01,
        "{}",
        p2[0].lines[0].x
    );
}
