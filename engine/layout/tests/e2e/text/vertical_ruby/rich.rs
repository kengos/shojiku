//! Vertical ruby on rich (`spans`) blocks: readings beside per-run
//! arrangements, including a base crossing a span boundary within one
//! column.

use crate::common::*;

/// A vertical spans item with ruby entries.
fn rich_tmpl(spans_yaml: &str, ruby_lines: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: text
        box: {{ w: 200, h: 100 }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }}
        spans:
{spans_yaml}
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
fn a_reading_sits_beside_its_base_run() {
    let yaml = rich_tmpl(
        "          - text: 吾輩\n          - text: は猫",
        "          - { base: 吾輩, text: わがはい }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    let main = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| !b.lines.is_empty() && !b.lines[0].runs.is_empty())
        .expect("rich block");
    let line = &main.lines[0];
    let rs = readings(&doc.pages[0]);
    assert_eq!(rs.len(), 1);
    let r = &rs[0].lines[0];
    // 吾輩 is run 0 (down 0..20); わがはい at 5pt fills the 20pt extent.
    assert!((r.y - line.y).abs() < 0.01, "y {}", r.y);
    assert!((r.width - 20.0).abs() < 0.01, "width {}", r.width);
    // Right of the base column's em cell: col left + col/2 + size/2.
    assert!((r.x - (line.x + 10.0)).abs() < 0.01, "x {}", r.x);
}

#[test]
fn a_base_crossing_a_span_boundary_reads_as_one_extent() {
    // 輩は crosses span 0 (吾輩) into span 1 (は猫): one column slice
    // covering run 0's second cell (down 10..20) and run 1's first
    // (20..30) — one reading over the joined 20pt extent.
    let yaml = rich_tmpl(
        "          - text: 吾輩\n          - text: は猫",
        "          - { base: 輩は, text: よみ }",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.iter().any(|d| d.code == "ruby_base_not_found"));
    let main = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| !b.lines.is_empty() && !b.lines[0].runs.is_empty())
        .expect("rich block");
    let line = &main.lines[0];
    let rs = readings(&doc.pages[0]);
    assert_eq!(rs.len(), 1);
    let r = &rs[0].lines[0];
    assert_eq!(r.text, "よみ");
    // よみ at 5pt = 10pt, centered in the 20pt slice starting at down 10.
    assert!((r.y - (line.y + 10.0 + 5.0)).abs() < 0.01, "y {}", r.y);
}
