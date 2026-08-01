//! Rich-span guards and policy scope: clip/shrink/ellipsis handling,
//! the MAX_SPANS layout cap, hostile metrics, empty spans, the shared
//! missing-glyph budget, and vertical alignment.

use super::fixed_ascent;
use crate::common::*;

#[test]
fn rich_clip_reserves_the_authored_height() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        box: { w: 40, h: 20 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, textOverflow: clip }
        spans:
          - text: "ああああああああ"
          - text: "いい"
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 10, h: 10 }
"#,
        json!({}),
    );
    // Opted-in clip: no overflow warning, text inside a clip node.
    assert!(!diags.iter().any(|d| d.code == "text_overflow"));
    assert!(
        text_blocks(&doc.pages[0]).is_empty(),
        "block must be clipped"
    );
    let clips = crate::clip::clip_shapes(&doc.pages[0]);
    assert_eq!(clips.len(), 1);
    assert!((clips[0].h - 20.0).abs() < 1e-6);
    assert!(matches!(clips[0].items[0], LayoutItem::Text(_)));
    // The next flow item stacks right after the reserved 20pt, proving
    // the clipped block did not grow.
    let rect = rect_shapes(&doc.pages[0])[0];
    assert!((rect.y - 20.0).abs() < 1e-6, "rect.y = {}", rect.y);
}

#[test]
fn rich_shrink_and_ellipsis_warn_and_overflow_like_visible() {
    for policy in ["shrink", "ellipsis"] {
        let yaml = format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        box: {{ w: 40, h: 14 }}
        style: {{ fontFamily: biz-ud-gothic, fontSize: 10, textOverflow: {policy} }}
        spans:
          - text: "ああああああああ"
"#
        );
        let (doc, diags) = run(&yaml, json!({}));
        assert!(
            diags.iter().any(|d| d.code == "span_overflow_unsupported"),
            "{policy}: expected the unsupported warning"
        );
        // Falls back to visible: every line kept at the authored size,
        // and the standard overflow warning still fires.
        assert!(diags.iter().any(|d| d.code == "text_overflow"));
        let block = text_blocks(&doc.pages[0])[0];
        assert!(block.lines.len() > 1);
        assert_eq!(block.lines[0].runs[0].font_size, 10.0);
    }
}

#[test]
fn too_many_spans_render_only_the_cap() {
    let spans: String = (0..=MAX_SPANS).map(|_| "          - text: x\n").collect();
    let yaml = format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 5000, h: 500 }}
    items:
      - type: text
        spans:
{spans}"#
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(diags.iter().any(|d| d.code == "too_many_spans"));
    let block = text_blocks(&doc.pages[0])[0];
    let chars: usize = block.lines.iter().map(|l| l.text.chars().count()).sum();
    assert_eq!(chars, MAX_SPANS);
}

#[test]
fn hostile_span_metrics_clamp_like_block_ones() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        spans:
          - text: "aa"
            style: { fontSize: -5, letterSpacing: 1e300 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_font_size"));
    assert!(diags.iter().any(|d| d.code == "invalid_letter_spacing"));
    let block = text_blocks(&doc.pages[0])[0];
    // Clamped defaults: 10pt size, 0 spacing — the grid stays finite.
    assert!(block.line_height.is_finite());
    assert_eq!(block.lines[0].runs[0].font_size, 10.0);
    assert_eq!(block.lines[0].runs[0].letter_spacing, 0.0);
}

#[test]
fn all_empty_spans_fall_back_to_block_metrics() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        style: { fontFamily: biz-ud-gothic, fontSize: 10 }
        spans:
          - data: { key: ghost }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "missing_data"));
    let block = text_blocks(&doc.pages[0])[0];
    // One empty line at the block's own metrics (no span drew).
    assert!((block.line_height - 14.0).abs() < 1e-6);
    assert_eq!(block.baseline, Some(fixed_ascent(10.0)));
    assert_eq!(block.lines.len(), 1);
    assert!(block.lines[0].runs.is_empty());
}

#[test]
fn span_missing_glyphs_share_one_bounded_warning() {
    // Two spans, each with a distinct unmappable char (PUA): one warning
    // for the block, both chars listed, no per-span duplication.
    let (_, diags) = run(
        "
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        spans:
          - text: \"\u{E000}a\"
          - text: \"\u{E001}\u{E000}\"
",
        json!({}),
    );
    let missing: Vec<_> = diags.iter().filter(|d| d.code == "missing_glyph").collect();
    assert_eq!(missing.len(), 1, "one shared warning per block");
    assert!(missing[0].message.contains('\u{E000}'));
    assert!(missing[0].message.contains('\u{E001}'));
}

#[test]
fn rich_valign_and_min_height_reserve_like_plain() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        box: { w: 100, h: 42 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, verticalAlign: middle }
        spans:
          - text: "あ"
"#,
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    // One 14pt line centered in 42pt: offset (42-14)/2 = 14.
    assert!((block.lines[0].y - 14.0).abs() < 1e-6);
}

#[test]
fn rich_visible_overflow_warns_and_grows_like_plain() {
    // Default policy + a definite `h` too small: every line is kept,
    // the block grows past the authored height, and `text_overflow`
    // warns. Block-level bold/italic also resolve at block level (the
    // real-bold face drops the synthetic flag; italic stays synthetic).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        box: { w: 40, h: 14 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, fontWeight: bold, fontStyle: italic }
        spans:
          - text: "ああああああああ"
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "text_overflow"));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.lines.len() > 1);
    // Block-level flags: real bold face exists, italic is synthetic.
    assert!(!block.synthetic_bold);
    assert!(block.synthetic_italic);
    // The spans inherit the block's bold: the run picked the bold face.
    assert_eq!(block.lines[0].runs[0].font_id, "biz-ud-gothic-bold");
}
