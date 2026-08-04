//! Vertical (縦書き) text on the PDF backend: a column block renders
//! without error and emits a well-formed PDF with the upright and rotated
//! glyph paths both exercised.

use super::*;
use shojiku_layout::{LayoutDocument, TextBlock, TextLine};

#[test]
fn a_vertical_block_with_an_unknown_font_is_an_error() {
    // The vertical draw path must fail as loudly as the horizontal one
    // when the block names a face the renderer never embedded.
    let (_pack, fonts) = shared_fonts();
    let block = TextBlock {
        font_id: "ghost".to_string(),
        fallback_ids: Vec::new(),
        font_size: 10.0,
        line_height: 10.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: 1.0,
        baseline: None,
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: Some(shojiku_layout::TextOrientation::Mixed),
        text_combine: None,
        lines: vec![TextLine {
            text: "あ".to_string(),
            x: 0.0,
            y: 0.0,
            width: 10.0,
            runs: Vec::new(),
        }],
    };
    let doc = LayoutDocument {
        metadata: Default::default(),
        page_width: 100.0,
        page_height: 100.0,
        pages: vec![shojiku_layout::LayoutPage {
            items: vec![LayoutItem::Text(block)],
        }],
    };
    assert!(matches!(
        render_pdf(&doc, fonts, &AssetStore::empty()),
        Err(RenderError::UnknownFont(id)) if id == "ghost"
    ));
}

#[test]
fn vertical_text_renders_a_pdf() {
    // Upright CJK plus rotated Latin (`mixed`) in one column block: both
    // the straight and the rotate-transform draw paths run.
    let bytes = render_template(
        r#"
page: { size: { w: 200, h: 300 }, margin: 10 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "吾輩はコーヒーである2026"
        box: { x: 0, y: 0, w: 120, h: 260 }
        style: { fontSize: 18, writingMode: vertical_rl }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    // A page with drawn glyphs is more than an empty document.
    assert!(bytes.len() > 2000, "got {} bytes", bytes.len());
}

#[test]
fn upright_orientation_renders_a_pdf() {
    let bytes = render_template(
        r#"
page: { size: { w: 120, h: 200 }, margin: 10 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "AB年"
        box: { x: 0, y: 0, w: 100, h: 160 }
        style: { fontSize: 18, writingMode: vertical_rl, textOrientation: upright }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
}

#[test]
fn a_vertical_link_annotation_covers_the_column() {
    // Three 20pt cells stack ~60pt+ down a ~28pt-wide column: the link
    // rect must be TALLER than wide (the axes swap vs a horizontal line),
    // not a square at the column top.
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "あいう"
        box: { w: 100, h: 200 }
        link: { url: "https://example.com/v" }
        style: { fontSize: 20, writingMode: vertical_rl }
"#,
        json!({}),
    );
    let content = String::from_utf8_lossy(&bytes).to_string();
    assert!(content.contains("https://example.com/v"));
    // krilla writes `/Rect[…]` (no space); tolerate either spacing.
    let rect = content
        .split("/Rect")
        .nth(1)
        .and_then(|tail| tail.split('[').nth(1))
        .and_then(|tail| tail.split(']').next())
        .expect("a /Rect array in the annotation dict");
    let nums: Vec<f64> = rect
        .split_whitespace()
        .map(|n| n.parse().expect("rect number"))
        .collect();
    assert_eq!(nums.len(), 4, "rect: {rect}");
    let (w, h) = ((nums[2] - nums[0]).abs(), (nums[3] - nums[1]).abs());
    assert!(
        h > w * 1.5,
        "expected a tall column rect, got {w:.1} x {h:.1}"
    );
}

#[test]
fn vertical_rich_spans_render_a_pdf() {
    // Per-span vertical runs: two colors, two sizes, and a rotated-Latin
    // run — the rich column draw path (per run `arrange_vertical`) runs.
    let bytes = render_template(
        r##"
page: { size: { w: 200, h: 300 }, margin: 10 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 120, h: 260 }
        style: { fontSize: 16, writingMode: vertical_rl }
        spans:
          - { text: "吾輩は", style: { color: "#1155cc", fontSize: 22 } }
          - { text: "猫である2026", style: { color: "#cc3311" } }
"##,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    assert!(bytes.len() > 2000, "got {} bytes", bytes.len());
}

#[test]
fn a_combined_span_run_renders_a_pdf() {
    // 縦中横 riding a rich run (`TextRun::combine`): the per-run vertical
    // draw rebuilds its options from the run, so the combined cell (and
    // its compress-scale transform) reaches the PDF.
    let bytes = render_template(
        r#"
page: { size: { w: 200, h: 300 }, margin: 10 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 120, h: 260 }
        style: { fontSize: 16, writingMode: vertical_rl }
        spans:
          - { text: "第" }
          - { text: "2026", style: { textCombineUpright: { digits: 4 } } }
          - { text: "話" }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    assert!(bytes.len() > 2000, "got {} bytes", bytes.len());
}

#[test]
fn a_vertical_span_link_annotates_the_run() {
    // A per-span link on a vertical rich block: the annotation walk's rich
    // branch maps the run to a tall column rect at its down-offset.
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        box: { w: 100, h: 200 }
        style: { fontSize: 20, writingMode: vertical_rl }
        spans:
          - { text: "あいう", link: { url: "https://example.com/run" } }
"#,
        json!({}),
    );
    let content = String::from_utf8_lossy(&bytes).to_string();
    assert!(content.contains("https://example.com/run"));
    let rect = content
        .split("/Rect")
        .nth(1)
        .and_then(|tail| tail.split('[').nth(1))
        .and_then(|tail| tail.split(']').next())
        .expect("a /Rect array");
    let nums: Vec<f64> = rect
        .split_whitespace()
        .map(|n| n.parse().expect("rect number"))
        .collect();
    let (w, h) = ((nums[2] - nums[0]).abs(), (nums[3] - nums[1]).abs());
    assert!(h > w * 1.5, "expected a tall run rect, got {w:.1} x {h:.1}");
}

#[test]
fn combined_digits_and_ruby_render_a_pdf() {
    // 縦中横 (the scale-about-pen transform path, including a compressed
    // 4-digit group) and ruby reading columns both reach the PDF surface.
    let bytes = render_template(
        r#"
page: { size: { w: 200, h: 300 }, margin: 10 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "第12話は2026年"
        box: { x: 60, y: 0, w: 120, h: 260 }
        style: { fontSize: 18, writingMode: vertical_rl, textCombineUpright: { digits: 4 } }
      - type: text
        text: "吾輩"
        box: { x: 0, y: 0, w: 50, h: 260 }
        style: { fontSize: 18, lineHeight: 2.0, writingMode: vertical_rl }
        ruby:
          - { base: 吾輩, text: わがはい }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    assert!(bytes.len() > 2000, "got {} bytes", bytes.len());
}
