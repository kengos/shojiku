//! `render_raw`: encode-free RGBA pages sharing the PNG path's pipeline.

use super::*;

/// A one-page doc with a solid red rect filling the canvas, so the raw
/// pixels have a known, non-white value to probe.
fn red_doc() -> LayoutDocument {
    let mut doc = base_doc();
    doc.pages[0].items.push(LayoutItem::Rect(RectShape {
        x: 0.0,
        y: 0.0,
        w: 100.0,
        h: 100.0,
        stroke: None,
        stroke_width: 0.0,
        fill: Some((1.0, 0.0, 0.0)),
        opacity: 1.0,
        ..Default::default()
    }));
    doc
}

#[test]
fn raw_dims_and_length_match_the_scaled_canvas() {
    let doc = base_doc();
    let pages = render_raw(
        &doc,
        fonts(),
        &AssetStore::empty(),
        &PngOptions { scale: 2.0 },
    )
    .expect("render");
    assert_eq!(pages.len(), 1);
    let page = &pages[0];
    // 100pt page × scale 2 = 200px each way.
    assert_eq!(page.width_px, 200);
    assert_eq!(page.height_px, 200);
    assert_eq!(
        page.rgba.len(),
        page.width_px as usize * page.height_px as usize * 4
    );
}

#[test]
fn raw_pixels_are_straight_rgba() {
    let pages = render_raw(
        &red_doc(),
        fonts(),
        &AssetStore::empty(),
        &PngOptions { scale: 1.0 },
    )
    .expect("render");
    let page = &pages[0];
    // Opaque red at a central pixel: R=255, G=0, B=0, A=255 (un-premultiplied).
    let w = page.width_px;
    let i = ((50 * w + 50) * 4) as usize;
    assert_eq!(&page.rgba[i..i + 4], &[255, 0, 0, 255]);
}

#[test]
fn raw_matches_the_png_path_pixels() {
    // The raw pixels equal the PNG path's decoded pixels — one pipeline.
    let doc = red_doc();
    let raw = render_raw(
        &doc,
        fonts(),
        &AssetStore::empty(),
        &PngOptions { scale: 1.0 },
    )
    .expect("raw");
    let png = render_png(
        &doc,
        fonts(),
        &AssetStore::empty(),
        &PngOptions { scale: 1.0 },
    )
    .expect("png");
    let (w, h, decoded) = decode(&png[0]);
    assert_eq!((raw[0].width_px, raw[0].height_px), (w, h));
    assert_eq!(raw[0].rgba, decoded);
}

#[test]
fn raw_honors_the_input_guards() {
    let doc = base_doc();
    // Shares render_pages' validation: a bad scale errors before drawing.
    assert!(matches!(
        render_raw(
            &doc,
            fonts(),
            &AssetStore::empty(),
            &PngOptions { scale: f64::NAN }
        ),
        Err(RenderPngError::BadScale(_))
    ));
    let empty = LayoutDocument {
        metadata: Default::default(),
        page_width: 100.0,
        page_height: 100.0,
        pages: vec![],
    };
    assert!(matches!(
        render_raw(
            &empty,
            fonts(),
            &AssetStore::empty(),
            &PngOptions::default()
        ),
        Err(RenderPngError::NoPages)
    ));
}
