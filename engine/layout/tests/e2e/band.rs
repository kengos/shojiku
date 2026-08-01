//! Header/footer bands end to end: repeat rules, page numbers, and
//! percent resolution against the page.

use crate::common::*;

#[test]
fn header_footer_and_page_numbers() {
    let rows: Vec<Value> = (1..=40).map(|i| json!({"n": i})).collect();
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    repeat: every_page
    items:
      - type: text
        box: { x: 25, y: 30, w: 500, h: 20 }
        text: タイトル
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 300 }
    items:
      - type: table
        data: { key: items }
        columns:
          - data: { key: n }
            width: 100
  footer:
    repeat: every_page
    items:
      - type: page_number
        box: { x: 25, y: 800, w: 500, h: 12 }
        format: "{page} / {pages}"
"#,
        json!({ "items": rows }),
    );
    let pages = doc.pages.len();
    assert!(pages > 1);
    for (i, page) in doc.pages.iter().enumerate() {
        let text = all_text(page);
        assert!(text.contains("タイトル"), "header missing on page {i}");
        assert!(
            text.contains(&format!("{} / {pages}", i + 1)),
            "page number missing on page {i}: {text}"
        );
    }
}

#[test]
fn except_first_page_band() {
    let rows: Vec<Value> = (1..=40).map(|i| json!({"n": i})).collect();
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    repeat: except_first_page
    items:
      - type: text
        box: { x: 25, y: 30, w: 500, h: 20 }
        text: 前ページから続き
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 300 }
    items:
      - type: table
        data: { key: items }
        columns:
          - data: { key: n }
            width: 100
"#,
        json!({ "items": rows }),
    );
    assert!(doc.pages.len() > 1);
    assert!(!all_text(&doc.pages[0]).contains("前ページから続き"));
    assert!(all_text(&doc.pages[1]).contains("前ページから続き"));
}

#[test]
fn bands_support_rects_and_lines() {
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { x: 5, y: 10, w: 200, h: 30 }
      - type: line
        from: { x: 0, y: 50 }
        to: { x: 300, y: 50 }
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    items:
      - type: text
        text: body
"#,
        json!({ "items": [] }),
    );
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!((rects[0].x, rects[0].y), (5.0, 10.0));
    let lines = line_shapes(&doc.pages[0]);
    assert_eq!((lines[0].y1, lines[0].y2), (50.0, 50.0));
}

#[test]
fn page_number_box_resolves_percent_of_page() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 100 }
    items:
      - type: text
        text: body
  footer:
    items:
      - type: page_number
        box: { x: "0%", y: "95%", w: "100%", h: 14 }
        style: { textAlign: left }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    let pn = texts
        .iter()
        .find(|t| t.lines[0].text == "1 / 1")
        .expect("page number");
    assert_eq!(pn.lines[0].x, 0.0);
    // 95% of 841.89.
    assert!((pn.lines[0].y - 799.7955).abs() < 1e-9);
}

#[test]
fn container_in_band_resolves_page_percent() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: container
        box: { x: "10%", y: "50%", h: 40 }
        items:
          - type: text
            box: { x: "0%" }
            text: banner
            style: { fontSize: 10, lineHeight: 1.0 }
  body:
    type: flow
    box: { x: 0, y: 700, w: 400, h: 100 }
    items:
      - type: text
        text: body
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    // 10% of 595.28, 50% of 841.89.
    assert!((texts[0].lines[0].x - 59.528).abs() < 1e-9);
    assert!((texts[0].lines[0].y - 420.945).abs() < 1e-9);
}

#[test]
fn a_vertical_page_number_renders_as_a_column() {
    // `writingMode: vertical_rl` on a `page_number` stacks `1／1` down a
    // column instead of a horizontal line, repeating on every page.
    let rows: Vec<Value> = (1..=40).map(|i| json!({ "n": i })).collect();
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - label: n
            data: { key: n }
            width: 100
            style: { fontSize: 10 }
  footer:
    items:
      - type: page_number
        box: { x: 10, y: 10, w: 30, h: 60 }
        format: "{page}／{pages}"
        style: { fontFamily: biz-ud-gothic, fontSize: 12, writingMode: vertical_rl }
"#,
        json!({ "rows": rows }),
    );
    assert!(!diags.has_errors());
    assert!(doc.pages.len() > 1, "expected pagination");
    for page in &doc.pages {
        let pn = text_blocks(page)
            .into_iter()
            .find(|t| t.vertical.is_some())
            .expect("a vertical page number on every page");
        assert!(pn.lines[0].text.contains('／'));
    }
}
