//! Fail-closed guards for the annotation walk: degenerate rects, clip
//! depth, degenerate clips. (URL/geometry content is asserted on real
//! rendered PDFs in `crate::tests::links`.)

use super::collect_annotations;
use shojiku_layout::{ClipShape, ImageShape, LayoutItem};

fn linked_image(x: f64, y: f64, w: f64, h: f64) -> LayoutItem {
    LayoutItem::Image(ImageShape {
        asset_id: "logo".to_string(),
        opacity: 1.0,
        x,
        y,
        w,
        h,
        link: Some("https://example.com".to_string()),
    })
}

fn collect(items: &[LayoutItem]) -> usize {
    let mut out = Vec::new();
    collect_annotations(items, 0, &mut out);
    out.len()
}

#[test]
fn degenerate_link_rects_emit_no_annotation() {
    // Zero-sized and non-finite rects cannot become krilla rects: the
    // link is dropped rather than written broken into the PDF.
    assert_eq!(collect(&[linked_image(0.0, 0.0, 0.0, 10.0)]), 0);
    assert_eq!(collect(&[linked_image(0.0, 0.0, 10.0, f64::NAN)]), 0);
    assert_eq!(collect(&[linked_image(f64::INFINITY, 0.0, 10.0, 10.0)]), 0);
    // Finite in f64 but overflowing the f32 cast: the krilla rect layer.
    assert_eq!(collect(&[linked_image(1e39, 0.0, 10.0, 10.0)]), 0);
    // Sanity: the same shape with a real rect does annotate.
    assert_eq!(collect(&[linked_image(0.0, 0.0, 10.0, 10.0)]), 1);
}

#[test]
fn degenerate_or_too_deep_clips_drop_their_links() {
    // A clip that draws nothing must not stay clickable (same guard as
    // drawing): degenerate rect...
    let degenerate = LayoutItem::Clip(ClipShape {
        x: 0.0,
        y: 0.0,
        w: 0.0,
        h: 10.0,
        items: vec![linked_image(0.0, 0.0, 10.0, 10.0)],
        ..Default::default()
    });
    assert_eq!(collect(&[degenerate]), 0);
    // ...and nesting past MAX_CLIP_DEPTH (hand-built trees only).
    let mut nested = linked_image(0.0, 0.0, 10.0, 10.0);
    for _ in 0..shojiku_layout::MAX_CLIP_DEPTH + 1 {
        nested = LayoutItem::Clip(ClipShape {
            x: 0.0,
            y: 0.0,
            w: 100.0,
            h: 100.0,
            items: vec![nested],
            ..Default::default()
        });
    }
    assert_eq!(collect(&[nested]), 0);
    // A shallow healthy clip keeps its link.
    let shallow = LayoutItem::Clip(ClipShape {
        x: 0.0,
        y: 0.0,
        w: 100.0,
        h: 100.0,
        items: vec![linked_image(0.0, 0.0, 10.0, 10.0)],
        ..Default::default()
    });
    assert_eq!(collect(&[shallow]), 1);
}
