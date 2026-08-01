//! `box.padding` on leaf items: text (wrap/valign/background),
//! images, rects (ignored), and page numbers.

use crate::common::*;

#[test]
fn text_padding_insets_lines_and_background_covers_border_box() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hello
        box: { x: 10, y: 20, w: 100, h: 50, padding: { top: 5, right: 8, bottom: 5, left: 8 } }
        style: { fontSize: 10, lineHeight: 1.0, backgroundColor: "#ff0000" }
"##,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    // Background fills the full border box, not the padded content box.
    let bg = rect_shapes(&doc.pages[0])[0];
    assert_eq!((bg.x, bg.y, bg.w, bg.h), (10.0, 20.0, 100.0, 50.0));
    let line = &text_blocks(&doc.pages[0])[0].lines[0];
    assert_eq!((line.x, line.y), (18.0, 25.0));
}
#[test]
fn text_padding_shrinks_the_wrap_width() {
    let yaml = |padding: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 600 }}
    items:
      - type: text
        text: ああああああ
        box: {{ w: 100{padding} }}
        style: {{ fontSize: 10, lineHeight: 1.0 }}
"#
        )
    };
    let (doc, diags) = run(&yaml(""), json!({}));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(text_blocks(&doc.pages[0])[0].lines.len(), 1);

    let (doc, diags) = run(&yaml(", padding: { left: 30, right: 30 }"), json!({}));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let block = text_blocks(&doc.pages[0])[0];
    // Content width is 100 - 30 - 30 = 40pt: the six 10pt kana wrap.
    assert_eq!(block.lines.len(), 2);
    assert_eq!(block.lines[0].x, 30.0);
}
#[test]
fn vertical_align_centers_within_the_content_box() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: mid
        box: { x: 0, y: 0, w: 100, h: 64, padding: { top: 10, bottom: 10 } }
        style: { fontSize: 10, lineHeight: 1.0, verticalAlign: middle }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    // Content box height 64 - 20 = 44; slack (44 - 10) / 2 = 17; +top pad.
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 27.0);
}
#[test]
fn text_overflow_accounts_for_padding() {
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: tall
        box: { x: 0, y: 0, w: 100, h: 20, padding: { top: 8, bottom: 8 } }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "text_overflow"));
}
#[test]
fn image_padding_insets_the_fit_box() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: image
        box: { w: 30, h: 30, padding: 5 }
        src: logo.png
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    // 10x10 asset in the 20x20 content box: scale 2, offset by padding.
    let img = image_shapes(&doc.pages[0])[0];
    assert_eq!((img.x, img.y, img.w, img.h), (5.0, 5.0, 20.0, 20.0));
}
#[test]
fn image_padding_swallowing_the_box_warns_and_skips() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: image
        box: { w: 30, h: 30, padding: 20 }
        src: logo.png
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.iter().any(|d| d.code == "image_missing_size"));
    assert!(image_shapes(&doc.pages[0]).is_empty());
}
#[test]
fn rect_padding_is_ignored() {
    let yaml = |padding: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: rect
        style: {{ borderWidth: 1 }}
        box: {{ x: 5, y: 5, w: 40, h: 20{padding} }}
"#
        )
    };
    let (plain, diags) = run(&yaml(""), json!({}));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let (padded, diags) = run(&yaml(", padding: 6"), json!({}));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let (a, b) = (
        rect_shapes(&plain.pages[0])[0],
        rect_shapes(&padded.pages[0])[0],
    );
    assert_eq!((a.x, a.y, a.w, a.h), (b.x, b.y, b.w, b.h));
}
#[test]
fn page_number_takes_margin_and_padding() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: page_number
        box: { x: 0, y: 10, w: 100, h: 30, margin: { top: 2, left: 3 }, padding: { top: 4, left: 12 } }
        format: "{page}"
  body:
    type: absolute
    items:
      - type: text
        text: body
        box: { y: 200 }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let pn = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.lines[0].text == "1")
        .expect("page number");
    assert_eq!((pn.lines[0].x, pn.lines[0].y), (15.0, 16.0));
}
#[test]
fn padding_percent_resolves_against_width_even_vertically() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 600 }
    items:
      - type: text
        text: pct
        box: { padding: { top: "10%" } }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    // 10% of the 200pt-wide parent = 20pt of top padding.
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 20.0);
}
