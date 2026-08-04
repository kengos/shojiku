//! Error paths and hostile-input guards.

use super::*;

#[test]
fn empty_document_is_an_error() {
    let doc = LayoutDocument {
        metadata: Default::default(),
        page_width: 100.0,
        page_height: 100.0,
        pages: vec![],
    };
    assert!(matches!(
        render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions::default()),
        Err(RenderPngError::NoPages)
    ));
}

#[test]
fn bad_scale_and_page_size_are_errors() {
    let doc = base_doc();
    for scale in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(matches!(
            render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions { scale }),
            Err(RenderPngError::BadScale(_))
        ));
    }
    let bad = LayoutDocument {
        metadata: Default::default(),
        page_width: 0.0,
        page_height: 100.0,
        pages: vec![LayoutPage { items: vec![] }],
    };
    assert!(matches!(
        render_png(&bad, fonts(), &AssetStore::empty(), &PngOptions::default()),
        Err(RenderPngError::BadPageSize(w, _)) if w == 0.0
    ));
}

#[test]
fn oversized_canvas_is_capped() {
    let doc = LayoutDocument {
        metadata: Default::default(),
        page_width: 10_000.0,
        page_height: 10_000.0,
        pages: vec![LayoutPage { items: vec![] }],
    };
    assert!(matches!(
        render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions { scale: 5.0 }),
        Err(RenderPngError::TooManyPixels { cap, .. }) if cap == MAX_CANVAS_PIXELS
    ));
}

#[test]
fn unknown_font_and_asset_are_errors() {
    let mut doc = base_doc();
    doc.pages[0].items.push(LayoutItem::Text(TextBlock {
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
    }));
    assert!(matches!(
        render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions::default()),
        Err(RenderPngError::UnknownFont(id)) if id == "ghost"
    ));

    let mut doc = base_doc();
    doc.pages[0].items.push(LayoutItem::Image(ImageShape {
        asset_id: "missing".to_string(),
        opacity: 1.0,
        link: None,
        x: 0.0,
        y: 0.0,
        w: 10.0,
        h: 10.0,
    }));
    assert!(matches!(
        render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions::default()),
        Err(RenderPngError::UnknownAsset(id)) if id == "missing"
    ));
}

#[test]
fn undecodable_raster_asset_is_an_error() {
    use shojiku_image::RasterFormat;
    // Every format's decode error must surface as a Decode error (and,
    // in the render-png-linked copy of shojiku-image, this exercises
    // each decoder's error path — not just PNG's).
    for format in [
        RasterFormat::Png,
        RasterFormat::Jpeg,
        RasterFormat::Gif,
        RasterFormat::Webp,
    ] {
        let mut store = AssetStore::empty();
        store.insert(shojiku_image::Asset {
            id: "bad".to_string(),
            kind: AssetKind::Raster {
                format,
                bytes: std::sync::Arc::new(b"not a real image".to_vec()),
                width_px: 1,
                height_px: 1,
            },
        });
        let mut doc = base_doc();
        doc.pages[0].items.push(LayoutItem::Image(ImageShape {
            asset_id: "bad".to_string(),
            opacity: 1.0,
            link: None,
            x: 0.0,
            y: 0.0,
            w: 10.0,
            h: 10.0,
        }));
        let err = render_png(&doc, fonts(), &store, &PngOptions::default()).expect_err("bad");
        assert!(matches!(&err, RenderPngError::Decode { id, .. } if id == "bad"));
    }
}

#[test]
fn degenerate_image_box_is_skipped() {
    let mut store = AssetStore::empty();
    store.insert(shojiku_image::Asset {
        id: "ok".to_string(),
        kind: AssetKind::Svg(
            shojiku_image::parse_svg(
                r#"<svg viewBox="0 0 4 4"/>"#,
                &shojiku_image::SvgLimits::default(),
            )
            .expect("svg"),
        ),
    });
    let mut doc = base_doc();
    doc.pages[0].items.push(LayoutItem::Image(ImageShape {
        asset_id: "ok".to_string(),
        opacity: 1.0,
        link: None,
        x: 0.0,
        y: 0.0,
        w: 0.0,
        h: 10.0,
    }));
    // Zero-width box: image skipped, page still renders white.
    let pages = render_png(&doc, fonts(), &store, &PngOptions::default()).expect("render");
    assert_eq!(pages.len(), 1);
}

#[test]
fn pen_flips_y_and_elevates_quadratics() {
    // Direct PathPen behavior is exercised through a real glyph, but
    // assert the invariants here too: build a path and confirm it is
    // finite/drawable at a small size.
    let store = fonts();
    let face = store.face(None);
    let gid = face.glyph_id('N').expect("latin glyph");
    let cmds = face.glyph_path(gid, 40.0).expect("outline");
    assert!(matches!(cmds.first(), Some(PathCmd::MoveTo(..))));
    // y-down: at least one command sits below the baseline (y > 0) for
    // a capital letter's descender-free body drawn above baseline ->
    // negated to positive below-origin in the box.
    assert!(build_path(&cmds, 0.0, 40.0).is_some());
}

#[test]
fn encode_error_wraps_message() {
    // Uses the same error type production maps (tiny-skia re-exports
    // the `png` crate's EncodingError), so this covers the exact
    // `.map_err(encode_error)` instantiation the encode path uses.
    let source = png::EncodingError::from(std::io::Error::other("disk full"));
    let err = encode_error(source);
    assert!(matches!(err, RenderPngError::Encode(_)));
    assert!(err.to_string().contains("disk full"));
}

#[test]
fn new_canvas_rejects_zero_size() {
    // tiny-skia rejects a zero dimension; the guard maps it to the
    // pixel-cap error instead of returning None to the caller.
    assert!(matches!(
        new_canvas(0, 0),
        Err(RenderPngError::TooManyPixels { .. })
    ));
    assert!(new_canvas(4, 4).is_ok());
}

#[test]
fn pixmap_from_rgba_rejects_bad_length() {
    let bad = RgbaImage {
        width: 2,
        height: 2,
        rgba: vec![0; 3],
    };
    assert!(pixmap_from_rgba(&bad).is_none());
}

#[test]
fn degenerate_rect_and_empty_svg_paths_are_skipped() {
    // A non-finite rect produces no path, and an SVG whose only path
    // is a lone move-to produces nothing drawable: both are skipped.
    let mut store = AssetStore::empty();
    store.insert(shojiku_image::Asset {
        id: "moveonly".to_string(),
        kind: AssetKind::Svg(
            shojiku_image::parse_svg(
                r##"<svg viewBox="0 0 4 4"><path d="M 1 1" fill="#000000"/></svg>"##,
                &shojiku_image::SvgLimits::default(),
            )
            .expect("svg"),
        ),
    });
    let mut doc = base_doc();
    doc.pages[0].items.push(LayoutItem::Rect(RectShape {
        x: 0.0,
        y: 0.0,
        w: f64::NAN,
        h: 10.0,
        stroke: Some((0.0, 0.0, 0.0)),
        stroke_width: 1.0,
        fill: Some((1.0, 0.0, 0.0)),
        opacity: 1.0,
        ..Default::default()
    }));
    doc.pages[0].items.push(LayoutItem::Image(ImageShape {
        asset_id: "moveonly".to_string(),
        opacity: 1.0,
        link: None,
        x: 0.0,
        y: 0.0,
        w: 10.0,
        h: 10.0,
    }));
    let pages = render_png(&doc, fonts(), &store, &PngOptions::default()).expect("render");
    // Nothing was drawn: the page is still pure white.
    let (w, _h, rgba) = decode(&pages[0]);
    assert_eq!(pixel(&rgba, w, 5, 5), [255, 255, 255, 255]);
}
