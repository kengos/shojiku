//! RT1 rich spans on the PDF backend: per-run fonts/colors/synthetic
//! effects/decoration draw through the run path, and hand-built rich
//! trees fail loudly on unknown run fonts.

use super::*;
use shojiku_image::AssetStore;
use shojiku_layout::{LayoutDocument, TextBlock, TextLine, TextRun};

#[test]
fn rich_spans_render_per_run_fonts_and_effects() {
    // Three spans exercising the run path: plain, a real-bold family
    // switch, and a synthetic bold+italic underlined mincho span (IPAmj
    // has no bold/italic faces → both synthetic + a decoration rect).
    let bytes = render_template(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: text
        box: { w: 400 }
        style: { fontSize: 14 }
        spans:
          - text: "合計 "
          - text: "1,234円"
            style: { fontWeight: bold, color: '#c00000' }
          - text: " 税込"
            style: { fontFamily: ipamj-mincho, fontWeight: bold, fontStyle: italic, textDecoration: underline, fontSize: 10 }
"##,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
}

#[test]
fn unknown_run_font_is_an_error() {
    // The block's own font is valid; the run names a ghost face — the
    // run path must fail as loudly as the block path does.
    let (_pack, fonts) = shared_fonts();
    let block = TextBlock {
        font_id: fonts.default_id().to_string(),
        fallback_ids: Vec::new(),
        font_size: 10.0,
        line_height: 14.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: 1.0,
        baseline: Some(10.0),
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: vec![TextLine {
            text: "x".to_string(),
            x: 0.0,
            y: 0.0,
            width: 5.0,
            runs: vec![TextRun {
                combine: None,
                text: "x".to_string(),
                span: 0,
                link: None,
                x: 0.0,
                width: 5.0,
                font_id: "ghost".to_string(),
                fallback_ids: vec!["also-ghost".to_string()],
                font_size: 10.0,
                letter_spacing: 0.0,
                color: (0.0, 0.0, 0.0),
                synthetic_bold: false,
                synthetic_italic: false,
                decoration: None,
            }],
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
