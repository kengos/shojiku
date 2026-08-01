//! fontSize/letterSpacing as length strings through the live cascade:
//! em multiplication, hostile amplification, and em==pt spacing.

use crate::common::*;

#[test]
fn font_size_em_cascades_through_containers() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: container
        style: { fontSize: 20 }
        box: { h: 100 }
        items:
          - type: text
            text: aaa
            box: { x: 0, y: 0 }
            style: { fontSize: "1.5em", lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.font_size, 30.0);
}

#[test]
fn hostile_em_font_size_amplification_degrades_with_a_diagnostic() {
    // 10 (default) × 1e308 overflows to infinity in the cascade; the
    // use-site guard falls back with `invalid_font_size`, never a panic.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: container
        style: { fontSize: "1e308em" }
        box: { h: 100 }
        items:
          - type: text
            text: aaa
            box: { x: 0, y: 0 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_font_size"));
    assert_eq!(text_blocks(&doc.pages[0])[0].font_size, 10.0);
}

#[test]
fn em_letter_spacing_matches_its_pt_equivalent() {
    let yaml = |spacing: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 200 }}
    items:
      - type: text
        text: aaaa
        box: {{ x: 0, y: 0 }}
        style: {{ fontSize: 10, lineHeight: 1.0, letterSpacing: {spacing} }}
"#
        )
    };
    let (em_doc, diags) = run(&yaml("\"0.5em\""), json!({}));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let (pt_doc, _) = run(&yaml("5"), json!({}));
    let em_w = text_blocks(&em_doc.pages[0])[0].lines[0].width;
    let pt_w = text_blocks(&pt_doc.pages[0])[0].lines[0].width;
    assert!(em_w > 10.0, "spacing must widen the line: {em_w}");
    assert!((em_w - pt_w).abs() < 1e-9, "em {em_w} != pt {pt_w}");
}
