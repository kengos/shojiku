//! Horizontal ruby on rich (`spans`) blocks: readings above the base
//! run's OWN em band (a small span's band starts below the shared
//! baseline's top), located through per-run shaping.

use super::ruby_blocks;
use crate::common::*;

/// A horizontal spans item with ruby entries.
fn rich_tmpl(spans_yaml: &str, ruby_lines: &str, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: text
        box: {{ w: 200 }}
        style: {{ fontSize: 10, lineHeight: 2.0, fontFamily: biz-ud-gothic{style_extra} }}
        spans:
{spans_yaml}
        ruby:
{ruby_lines}
"#
    )
}

#[test]
fn readings_sit_above_their_own_spans_band() {
    // span0 at 10pt, span1 at 20pt: the shared baseline is the 20pt
    // ascent, so span1's em top IS the line top while span0's sits lower.
    let yaml = rich_tmpl(
        "          - text: 吾輩\n          - { text: は猫, style: { fontSize: 20 } }",
        "          - { base: 吾輩, text: わが }\n          - { base: は猫, text: はね }",
        "",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    let main = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| !b.lines.is_empty() && !b.lines[0].runs.is_empty())
        .expect("rich block");
    let line = &main.lines[0];
    let rubies = ruby_blocks(&doc.pages[0]);
    assert_eq!(rubies.len(), 2);
    let (r_small, r_big) = (&rubies[0].lines[0], &rubies[1].lines[0]);
    // The big span's em top is the line top: its reading ends at line.y.
    assert!(
        (r_big.y - (line.y - 5.0)).abs() < 0.01,
        "big-span reading y {} vs line {}",
        r_big.y,
        line.y
    );
    // The small span's band starts lower, so its reading sits lower too.
    assert!(r_small.y > r_big.y, "{} > {}", r_small.y, r_big.y);
    // The big base は猫 spans 40pt starting at run1.x (= span0's 20pt).
    assert!((r_big.x - (20.0 + (40.0 - 10.0) / 2.0)).abs() < 0.01);
}

#[test]
fn rich_readings_ride_inside_a_clip_wrapper() {
    let yaml = rich_tmpl(
        "          - text: 吾輩",
        "          - { base: 吾輩, text: わが }",
        ", textOverflow: clip",
    )
    .replace("box: { w: 200 }", "box: { w: 200, h: 10 }");
    let (doc, _d) = run(&yaml, json!({}));
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
    assert_eq!(clip_texts, 2, "rich block + reading, both clipped");
}
