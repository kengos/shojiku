//! LK1 link annotations on the PDF backend: URI actions per line/run,
//! image draw boxes, and links inside clip groups.

use super::*;

fn lossy(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).to_string()
}

fn link_count(content: &str) -> usize {
    content.matches("/Subtype /Link").count() + content.matches("/Subtype/Link").count()
}

#[test]
fn linked_text_emits_one_uri_annotation_per_line() {
    // `box.w: 40` wraps three identical words onto three lines: one
    // borderless URI annotation per line rect.
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 600 }
    items:
      - type: text
        text: "aaa aaa aaa"
        box: { w: 40 }
        link: { url: "https://example.com/shop" }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    let content = lossy(&bytes);
    assert!(content.contains("/Annots"), "no /Annots array in output");
    assert!(content.contains("/URI"), "no URI action in output");
    assert!(content.contains("https://example.com/shop"));
    assert_eq!(link_count(&content), 3, "one annotation per wrapped line");
}

#[test]
fn span_link_annotates_only_that_run() {
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 600 }
    items:
      - type: text
        box: { w: 400 }
        spans:
          - text: "see "
          - text: terms
            link: { url: "https://example.com/terms" }
"#,
        json!({}),
    );
    let content = lossy(&bytes);
    assert_eq!(link_count(&content), 1, "only the linked run annotates");
    assert!(content.contains("https://example.com/terms"));
}

#[test]
fn image_and_clipped_text_links_annotate() {
    // An inline-SVG image link plus a `textOverflow: clip` text link:
    // the annotation walk covers image boxes and recurses into the clip
    // group the block was wrapped in.
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 600 }
    items:
      - type: image
        box: { w: 40, h: 40 }
        src: "<svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\"/></svg>"
        link: { url: "https://example.com/logo" }
      - type: text
        text: "aaa aaa aaa aaa"
        box: { w: 40, h: 12 }
        link: { url: "https://example.com/clipped" }
        style: { fontSize: 10, lineHeight: 1.0, textOverflow: clip }
"#,
        json!({}),
    );
    let content = lossy(&bytes);
    assert!(content.contains("https://example.com/logo"));
    assert!(content.contains("https://example.com/clipped"));
    assert!(link_count(&content) >= 2);
}

#[test]
fn linkless_documents_carry_no_annotations() {
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 600 }
    items:
      - type: text
        text: plain
"#,
        json!({}),
    );
    let content = lossy(&bytes);
    assert_eq!(link_count(&content), 0);
    assert!(!content.contains("/URI"));
}
