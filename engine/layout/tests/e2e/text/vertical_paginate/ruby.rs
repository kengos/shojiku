//! Ruby-aware column pagination: a ruby'd direct-flow vertical block
//! paginates at column boundaries and every fragment carries ITS
//! columns' readings, re-anchored at the fragment's own column xs —
//! including a base run spanning the fragment boundary.

use crate::common::*;

/// A vertical flow text item with ruby entries. Box `w: 25, h: 40` gives
/// 4 chars per column and 2 columns per page over the 14-char text
/// 吾輩は猫|である名|前はまだ|無い → 4 columns → 2 pages.
fn ruby_tmpl(ruby_lines: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: text
        text: "吾輩は猫である名前はまだ無い"
        box: {{ w: 25, h: 40 }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }}
        ruby:
{ruby_lines}
"#
    )
}

/// Reading blocks (smaller than the 10pt base size).
fn readings(page: &LayoutPage) -> Vec<&TextBlock> {
    text_blocks(page)
        .into_iter()
        .filter(|b| b.font_size < 10.0)
        .collect()
}

#[test]
fn every_fragment_carries_its_columns_readings() {
    let (doc, diags) = run(
        &ruby_tmpl(
            "          - { base: 吾輩, text: わがはい }\n          - { base: まだ, text: マダヨ }",
        ),
        json!({}),
    );
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    assert_eq!(doc.pages.len(), 2, "columns continue on the next page");
    // Page 1: 吾輩 heads column 0 (the rightmost, x 15) — its reading
    // sits at x 25 (col left + col/2 + size/2), down 0..20.
    let p1 = readings(&doc.pages[0]);
    assert_eq!(p1.len(), 1);
    let r1 = &p1[0].lines[0];
    assert_eq!(r1.text, "わがはい");
    assert!((r1.x - 25.0).abs() < 0.01, "x {}", r1.x);
    // Page 2: まだ sits in column 2, which re-anchors as page 2's FIRST
    // (rightmost) column — reading x re-anchored to 15 + 10.
    let p2 = readings(&doc.pages[1]);
    assert_eq!(p2.len(), 1);
    let r2 = &p2[0].lines[0];
    assert_eq!(r2.text, "マダヨ");
    assert!((r2.x - 25.0).abs() < 0.01, "x {}", r2.x);
    // まだ is chars 3..5 of its column (down 20..40); マダヨ at 5pt is
    // 15pt, centered → y 22.5.
    assert!((r2.y - 22.5).abs() < 0.01, "y {}", r2.y);
}

#[test]
fn a_base_spanning_the_fragment_boundary_splits_per_fragment() {
    // 名前 = the last char of column 1 (page 1) + the first of column 2
    // (page 2): each fragment carries its slice's half of めいめい.
    let (doc, diags) = run(
        &ruby_tmpl("          - { base: 名前, text: めいめい }"),
        json!({}),
    );
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    assert_eq!(doc.pages.len(), 2);
    let p1 = readings(&doc.pages[0]);
    assert_eq!(p1.len(), 1);
    assert_eq!(p1[0].lines[0].text, "めい");
    // 名 is column 1's last cell (down 30..40); めい at 5pt = 10pt.
    assert!((p1[0].lines[0].y - 30.0).abs() < 0.01);
    let p2 = readings(&doc.pages[1]);
    assert_eq!(p2.len(), 1);
    assert_eq!(p2[0].lines[0].text, "めい");
    // 前 heads column 2, re-anchored as page 2's rightmost column.
    assert!((p2[0].lines[0].y - 0.0).abs() < 0.01);
    assert!((p2[0].lines[0].x - 25.0).abs() < 0.01);
}

#[test]
fn the_page_cap_still_stops_a_ruby_fragment_loop() {
    // The vertical page-cap guard with a reading attached: the loop
    // terminates at the cap with `page_overflow`, never spinning.
    let text = "あいうえおか".repeat(510);
    let yaml = format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: text
        text: "{text}"
        box: {{ w: 15, h: 30 }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }}
        ruby:
          - {{ base: あいう, text: よみ }}
"#
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert_eq!(doc.pages.len(), MAX_PAGES);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
    assert_eq!(readings(&doc.pages[0]).len(), 1, "the reading rides page 1");
}
