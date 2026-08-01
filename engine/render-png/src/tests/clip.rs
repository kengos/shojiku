//! Clip-group drawing (D2): mask clipping, nesting intersection, the
//! depth cap, and fail-closed degenerate rects — all asserted per pixel.

use super::*;
use shojiku_image::AssetStore;
use shojiku_layout::ClipShape;

const RED: (f32, f32, f32) = (1.0, 0.0, 0.0);
const WHITE: [u8; 4] = [255, 255, 255, 255];
const RED_PX: [u8; 4] = [255, 0, 0, 255];

fn red_rect(x: f64, y: f64, w: f64, h: f64) -> LayoutItem {
    LayoutItem::Rect(RectShape {
        x,
        y,
        w,
        h,
        stroke: None,
        stroke_width: 0.0,
        fill: Some(RED),
        opacity: 1.0,
        ..Default::default()
    })
}

/// Renders hand-built items on the 100pt base page at scale 1 and
/// decodes the pixels.
fn render_items(items: Vec<LayoutItem>) -> (u32, Vec<u8>) {
    let mut doc = base_doc();
    doc.pages[0].items = items;
    let out = render_png(
        &doc,
        fonts(),
        &AssetStore::empty(),
        &PngOptions { scale: 1.0 },
    )
    .expect("render");
    let (w, _h, rgba) = decode(&out[0]);
    (w, rgba)
}

/// Wraps `inner` in `n` nested identical clip groups.
fn nest_clips(n: usize, rect: ClipShape, inner: Vec<LayoutItem>) -> Vec<LayoutItem> {
    let mut items = inner;
    for _ in 0..n {
        items = vec![LayoutItem::Clip(ClipShape {
            items,
            ..rect.clone()
        })];
    }
    items
}

#[test]
fn clip_cuts_fill_at_the_rect_edge() {
    // A 40x40 red rect under a 20x20 clip: inside painted, outside not.
    let clip = LayoutItem::Clip(ClipShape {
        x: 0.0,
        y: 0.0,
        w: 20.0,
        h: 20.0,
        items: vec![red_rect(0.0, 0.0, 40.0, 40.0)],
        ..Default::default()
    });
    let (w, rgba) = render_items(vec![clip]);
    assert_eq!(pixel(&rgba, w, 10, 10), RED_PX);
    assert_eq!(pixel(&rgba, w, 30, 10), WHITE, "clipped horizontally");
    assert_eq!(pixel(&rgba, w, 10, 30), WHITE, "clipped vertically");
}

#[test]
fn nested_clips_intersect() {
    // Outer 0..30, inner 20..50: only the 20..30 overlap paints.
    let inner = LayoutItem::Clip(ClipShape {
        x: 20.0,
        y: 20.0,
        w: 30.0,
        h: 30.0,
        items: vec![red_rect(0.0, 0.0, 60.0, 60.0)],
        ..Default::default()
    });
    let outer = LayoutItem::Clip(ClipShape {
        x: 0.0,
        y: 0.0,
        w: 30.0,
        h: 30.0,
        items: vec![inner],
        ..Default::default()
    });
    let (w, rgba) = render_items(vec![outer]);
    assert_eq!(pixel(&rgba, w, 25, 25), RED_PX, "intersection paints");
    assert_eq!(pixel(&rgba, w, 10, 10), WHITE, "outer-only stays clipped");
    assert_eq!(pixel(&rgba, w, 40, 40), WHITE, "inner-only stays clipped");
}

#[test]
fn clip_depth_cap_draws_at_the_limit_and_skips_past_it() {
    let full = ClipShape {
        x: 0.0,
        y: 0.0,
        w: 100.0,
        h: 100.0,
        items: vec![],
        ..Default::default()
    };
    // MAX_CLIP_DEPTH nested groups: the innermost enters at depth
    // MAX_CLIP_DEPTH - 1 and still draws.
    let (w, rgba) = render_items(nest_clips(
        shojiku_layout::MAX_CLIP_DEPTH,
        full.clone(),
        vec![red_rect(0.0, 0.0, 10.0, 10.0)],
    ));
    assert_eq!(pixel(&rgba, w, 5, 5), RED_PX);
    // One deeper: the group at the cap is skipped (fail closed).
    let (w, rgba) = render_items(nest_clips(
        shojiku_layout::MAX_CLIP_DEPTH + 1,
        full,
        vec![red_rect(0.0, 0.0, 10.0, 10.0)],
    ));
    assert_eq!(pixel(&rgba, w, 5, 5), WHITE);
}

#[test]
fn degenerate_clip_rects_fail_closed() {
    // Zero-size, non-finite, and NaN-origin clip rects draw nothing
    // rather than leaking the content unclipped. A NaN origin passes the
    // size guard but yields no drawable rect path.
    for (cx, cw, ch) in [
        (0.0, 0.0, 20.0),
        (0.0, 20.0, f64::NAN),
        (0.0, -5.0, 20.0),
        (f64::NAN, 20.0, 20.0),
    ] {
        let clip = LayoutItem::Clip(ClipShape {
            x: cx,
            y: 0.0,
            w: cw,
            h: ch,
            items: vec![red_rect(0.0, 0.0, 40.0, 40.0)],
            ..Default::default()
        });
        let (w, rgba) = render_items(vec![clip]);
        assert_eq!(pixel(&rgba, w, 10, 10), WHITE, "x={cx} w={cw} h={ch}");
    }
}

#[test]
fn clipped_text_loses_ink_outside_the_rect() {
    // The same glyphs drawn clipped to a half-height box leave fewer
    // dark pixels than unclipped — the mask reaches the text path.
    let block = |_: ()| {
        LayoutItem::Text(TextBlock {
            font_id: fonts().default_id().to_string(),
            fallback_ids: Vec::new(),
            font_size: 40.0,
            line_height: 40.0,
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
                text: "あ".to_string(),
                x: 10.0,
                y: 10.0,
                width: 0.0,
                runs: Vec::new(),
            }],
        })
    };
    let (_, plain) = render_items(vec![block(())]);
    let clipped_item = LayoutItem::Clip(ClipShape {
        x: 0.0,
        y: 0.0,
        w: 100.0,
        h: 25.0,
        items: vec![block(())],
        ..Default::default()
    });
    let (_, clipped) = render_items(vec![clipped_item]);
    let dark = |rgba: &[u8]| rgba.chunks_exact(4).filter(|p| p[0] < 128).count();
    assert!(
        dark(&clipped) < dark(&plain),
        "clip must remove glyph ink: {} !< {}",
        dark(&clipped),
        dark(&plain)
    );
    assert!(dark(&clipped) > 0, "the in-rect part still draws");
}
