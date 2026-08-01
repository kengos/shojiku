//! QR hostile-input guards: content cap, missing size/content, and the
//! module-size warning.

use super::qr_rects;
use crate::common::*;

#[test]
fn interpolated_text_builds_the_encoded_url() {
    // `{{key}}`-style interpolation resolves before encoding; a missing
    // key warns (missing_data) exactly like text items.
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: { x: 0, y: 0, w: 58, h: 58 }
        text: "https://x.example/t/{ghost}"
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "missing_data"));
}

#[test]
fn qr_without_size_or_content_is_skipped_with_a_warning() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        text: TEST
      - type: qr_code
        box: { x: 0, y: 0, w: 58, h: 58 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "qr_missing_size"));
    assert!(diags.iter().any(|d| d.code == "empty_qr_code_item"));
    assert!(qr_rects(&doc.pages[0]).is_empty());
}

#[test]
fn hostile_content_length_is_capped() {
    let (doc, diags) = run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: {{ x: 0, y: 0, w: 58, h: 58 }}
        text: {}
"#,
            "A".repeat(5000)
        ),
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "qr_content_too_long"));
    assert!(qr_rects(&doc.pages[0]).is_empty());
}

#[test]
fn tiny_boxes_warn_module_too_small_but_still_draw() {
    // 10pt box over 29 modules → ~0.34pt modules: unprintable, warned,
    // but drawn (the author sees the problem on the preview).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: { x: 0, y: 0, w: 10, h: 10 }
        text: TEST1
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "qr_module_too_small"));
    assert!(!qr_rects(&doc.pages[0]).is_empty());
}

#[test]
fn empty_resolved_content_is_skipped_with_a_warning() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: { x: 0, y: 0, w: 58, h: 58 }
        text: ""
"#,
        json!({}),
    );
    assert!(diags
        .iter()
        .any(|d| d.code == "empty_qr_code_item" && d.message.contains("no content")));
    assert!(qr_rects(&doc.pages[0]).is_empty());
}

#[test]
fn padding_that_swallows_the_box_degrades_with_a_warning() {
    // Border box 30×30 with 20pt padding: the content box clamps to 0 and
    // the item skips instead of dividing by a degenerate square.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: { x: 0, y: 0, w: 30, h: 30, padding: 20 }
        text: TEST1
"#,
        json!({}),
    );
    assert!(diags
        .iter()
        .any(|d| d.code == "qr_missing_size" && d.message.contains("positive")));
    assert!(qr_rects(&doc.pages[0]).is_empty());
}
