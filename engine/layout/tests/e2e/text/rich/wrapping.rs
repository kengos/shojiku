//! Rich-span wrapping: cross-span kinsoku, long-text pagination of rich flow
//! text, and element-scoped bindings in repeat cells.

use crate::common::*;

#[test]
fn spans_wrap_as_one_text_and_kinsoku_crosses_boundaries() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        box: { w: 25 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10 }
        spans:
          - text: "ああ"
          - text: "。あ"
"#,
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    let texts = line_texts(block);
    // Same result as the plain "ああ。あ" fixture: kinsoku pulls the
    // second span's `。` down together with span 0's last char.
    assert_eq!(texts, vec!["あ", "あ。あ"]);
    // The moved chars keep their span attribution.
    let line2 = &block.lines[1];
    assert_eq!(line2.runs.len(), 2);
    assert_eq!((line2.runs[0].span, &*line2.runs[0].text), (0, "あ"));
    assert_eq!((line2.runs[1].span, &*line2.runs[1].text), (1, "。あ"));
}

#[test]
fn rich_flow_text_paginates_line_by_line() {
    // 40 paragraphs at ~14pt leading in a 100pt-tall region: the rich
    // block must split across pages like plain long text, runs
    // riding each fragment.
    // `\n` stays an ESCAPE inside the YAML double-quoted scalar (a raw
    // newline would fold to a space instead).
    let long: String = (0..40).map(|i| format!("行{i}\\n")).collect();
    let yaml = format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 200, h: 100 }}
    items:
      - type: text
        style: {{ fontFamily: biz-ud-gothic, fontSize: 10 }}
        spans:
          - text: "{long}"
          - text: "終"
            style: {{ fontSize: 12 }}
"#
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    assert!(doc.pages.len() > 1, "expected pagination");
    let first = text_blocks(&doc.pages[0])[0];
    assert_eq!(first.lines[0].text, "行0");
    assert!(first.lines[0].runs[0].span == 0);
    let last_page = text_blocks(&doc.pages[doc.pages.len() - 1])[0];
    let all: String = doc
        .pages
        .iter()
        .flat_map(|p| text_blocks(p))
        .flat_map(|b| b.lines.iter())
        .map(|l| l.text.clone())
        .collect();
    assert!(all.ends_with("終"));
    assert_eq!(last_page.baseline, first.baseline);
}

#[test]
fn spans_bind_element_scoped_inside_repeat_cells() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 200 }
    items:
      - type: repeat
        data: { key: tickets }
        grid: { columns: 2, rows: 1 }
        cell:
          items:
            - type: text
              box: { x: 0, y: 0, w: 90 }
              spans:
                - text: "No."
                - data: { key: number }
"#,
        json!({ "tickets": [ { "number": 11 }, { "number": 22 } ] }),
    );
    assert!(!diags.has_errors());
    let blocks = text_blocks(&doc.pages[0]);
    let texts: Vec<String> = blocks.iter().map(|b| b.lines[0].text.clone()).collect();
    assert_eq!(texts, vec!["No.11", "No.22"]);
    assert_eq!(blocks[0].lines[0].runs[1].span, 1);
}
