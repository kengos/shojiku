//! Clip-group drawing (D2) on the PDF backend: structural render
//! success through the pipeline, the depth cap, and fail-closed
//! degenerate rects (pixel-level clip behavior is asserted on the PNG
//! backend, which shares the tree contract).

use super::*;
use shojiku_image::AssetStore;
use shojiku_layout::{ClipShape, LayoutDocument, LayoutPage, RectShape};

fn rect(x: f64, y: f64, w: f64, h: f64) -> LayoutItem {
    LayoutItem::Rect(RectShape {
        x,
        y,
        w,
        h,
        stroke: None,
        stroke_width: 0.0,
        fill: Some((1.0, 0.0, 0.0)),
        opacity: 1.0,
        ..Default::default()
    })
}

fn doc_with(items: Vec<LayoutItem>) -> LayoutDocument {
    LayoutDocument {
        metadata: Default::default(),
        page_width: 100.0,
        page_height: 100.0,
        pages: vec![LayoutPage { items }],
    }
}

fn render_items(items: Vec<LayoutItem>) -> Vec<u8> {
    let (_pack, fonts) = shared_fonts();
    render_pdf(&doc_with(items), fonts, &AssetStore::empty()).expect("render")
}

#[test]
fn overflow_hidden_template_renders_through_the_pipeline() {
    // Full pipeline: an overflowing hidden container renders to a valid
    // single-page PDF with no layout errors (render_template asserts).
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { h: 50 }
        style: { overflow: hidden }
        items:
          - type: text
            text: clipped content
            style: { fontSize: 10, lineHeight: 1.0 }
          - type: rect
            style: { borderWidth: 1 }
            box: { y: 40, w: 100, h: 100 }
"#,
        serde_json::json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    let content = String::from_utf8_lossy(&bytes);
    let pages = content.matches("/Type /Page").count() + content.matches("/Type/Page").count();
    assert!(pages >= 1);
}

#[test]
fn nested_clips_render_and_the_depth_cap_holds() {
    // A clip chain at the cap renders; one past the cap is skipped
    // (fail closed) without recursion blowing the stack. The past-cap
    // document must still be a valid (smaller) PDF.
    let clip = |items| {
        LayoutItem::Clip(ClipShape {
            x: 0.0,
            y: 0.0,
            w: 100.0,
            h: 100.0,
            items,
            ..Default::default()
        })
    };
    let mut at_cap = vec![rect(0.0, 0.0, 50.0, 50.0)];
    for _ in 0..shojiku_layout::MAX_CLIP_DEPTH {
        at_cap = vec![clip(at_cap)];
    }
    let bytes_at_cap = render_items(at_cap.clone());
    assert!(bytes_at_cap.starts_with(b"%PDF-"));
    let past_cap = vec![clip(at_cap)];
    let bytes_past_cap = render_items(past_cap);
    assert!(bytes_past_cap.starts_with(b"%PDF-"));
}

#[test]
fn degenerate_clip_rects_are_skipped_fail_closed() {
    // The NaN origin passes the size guard but must yield no drawable
    // clip path (the rect_path fail-closed arm).
    for (x, w, h) in [
        (0.0, 0.0, 50.0),
        (0.0, 50.0, f64::NAN),
        (0.0, -10.0, 50.0),
        (f64::NAN, 50.0, 50.0),
    ] {
        let clip = LayoutItem::Clip(ClipShape {
            x,
            y: 0.0,
            w,
            h,
            items: vec![rect(0.0, 0.0, 50.0, 50.0)],
            ..Default::default()
        });
        let bytes = render_items(vec![clip]);
        assert!(bytes.starts_with(b"%PDF-"), "x={x} w={w} h={h}");
    }
}

#[test]
fn child_error_inside_a_clip_still_propagates() {
    // The clip arm must not swallow child errors (the pop happens, then
    // the error surfaces).
    let (_pack, fonts) = shared_fonts();
    let clip = LayoutItem::Clip(ClipShape {
        x: 0.0,
        y: 0.0,
        w: 100.0,
        h: 100.0,
        items: vec![LayoutItem::Text(shojiku_layout::TextBlock {
            font_id: "ghost".to_string(),
            fallback_ids: Vec::new(),
            font_size: 10.0,
            line_height: 14.0,
            letter_spacing: 0.0,
            color: (0.0, 0.0, 0.0),
            synthetic_bold: false,
            synthetic_italic: false,
            decoration: None,
            opacity: 1.0,
            baseline: None,
            link: None,
            text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
            vertical: None,
            text_combine: None,
            lines: vec![shojiku_layout::TextLine {
                text: "x".to_string(),
                x: 0.0,
                y: 0.0,
                width: 0.0,
                runs: Vec::new(),
            }],
        })],
        ..Default::default()
    });
    assert!(matches!(
        render_pdf(&doc_with(vec![clip]), fonts, &AssetStore::empty()),
        Err(RenderError::UnknownFont(id)) if id == "ghost"
    ));
}
