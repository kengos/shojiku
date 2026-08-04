//! Image shapes: raster embedding, SVG playback, error paths.

use super::*;

/// A valid 1x1 grayscale PNG.
const PNG_1X1: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMIBQAAVwBWP0MfTAAAAABJRU5ErkJggg==";

fn png_bytes() -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(PNG_1X1)
        .expect("decode png fixture")
}

fn store_with(id: &str, kind: shojiku_image::AssetKind) -> AssetStore {
    let mut store = AssetStore::empty();
    store.insert(shojiku_image::Asset {
        id: id.to_string(),
        kind,
    });
    store
}

fn raster_kind(bytes: Vec<u8>) -> shojiku_image::AssetKind {
    shojiku_image::AssetKind::Raster {
        format: RasterFormat::Png,
        bytes: std::sync::Arc::new(bytes),
        width_px: 1,
        height_px: 1,
    }
}

fn image_doc(shape: ImageShape) -> LayoutDocument {
    LayoutDocument {
        metadata: Default::default(),
        page_width: 595.28,
        page_height: 841.89,
        pages: vec![shojiku_layout::LayoutPage {
            items: vec![LayoutItem::Image(shape)],
        }],
    }
}

fn shape(asset_id: &str, w: f64, h: f64) -> ImageShape {
    ImageShape {
        asset_id: asset_id.to_string(),
        opacity: 1.0,
        link: None,
        x: 10.0,
        y: 10.0,
        w,
        h,
    }
}

#[test]
fn renders_raster_and_svg_images() {
    let bytes = render_template(
        &format!(
            r##"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 25, y: 100, w: 500, h: 600 }}
    items:
      - type: image
        box: {{ w: 100, h: 100 }}
        src: "data:image/png;base64,{PNG_1X1}"
      - type: image
        box: {{ w: 100, h: 50 }}
        fit: stretch
        src: "<svg viewBox='0 0 20 10'><g transform='translate(1 1) scale(0.9) rotate(3) skewX(2) skewY(1) matrix(1 0 0 1 0 0)'><rect width='20' height='10' fill='#336699'/><circle cx='5' cy='5' r='2'/><ellipse cx='9' cy='5' rx='2' ry='1'/><line x1='0' y1='0' x2='9' y2='9' stroke='#000000'/><polyline points='0,0 2,2' fill='none' stroke='#000000'/><polygon points='0,0 2,0 1,2'/></g><path d='M 0 0 L 20 10 H 2 V 3 C 1 1 2 2 3 3 S 4 4 5 5 Q 6 1 7 2 T 9 2 A 1 1 0 0 1 11 2 Z' fill='none' stroke='#ff0000' stroke-width='0.5'/></svg>"
"##
        ),
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    // The raster embed shows up as an image XObject.
    let content = String::from_utf8_lossy(&bytes);
    assert!(content.contains("/XObject"), "no image XObject in output");
}

#[test]
fn renders_svg_gradients() {
    let bytes = render_template(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: image
        box: { w: 200, h: 200 }
        fit: stretch
        src: "<svg viewBox='0 0 10 10'><defs><linearGradient id='lg' spreadMethod='repeat'><stop offset='0' stop-color='#ff0000'/><stop offset='1' stop-color='#0000ff'/></linearGradient><linearGradient id='lg2'><stop offset='0' stop-color='#ffff00'/><stop offset='1' stop-color='#00ffff'/></linearGradient><radialGradient id='rg' spreadMethod='reflect'><stop offset='0' stop-color='#00ff00'/><stop offset='1' stop-color='#000000'/></radialGradient></defs><rect width='10' height='3' fill='url(#lg)'/><rect y='3' width='10' height='3' fill='url(#lg2)'/><circle cx='5' cy='8' r='2' fill='url(#rg)'/></svg>"
"##,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    // krilla emits gradients as PDF shading patterns.
    let content = String::from_utf8_lossy(&bytes);
    assert!(
        content.contains("/Shading"),
        "no shading pattern in gradient output"
    );
}

#[test]
fn translucent_raster_and_svg_render_through_the_opacity_group() {
    // opacity < 1 wraps the whole image in a group alpha (push_opacity /
    // pop): both a raster and an SVG must render without unbalancing the
    // surface stack.
    let (_pack, fonts) = shared_fonts();
    let svg = shojiku_image::parse_svg(
        r##"<svg viewBox='0 0 10 10'><rect width='10' height='10' fill='#336699'/></svg>"##,
        &shojiku_image::SvgLimits::default(),
    )
    .expect("svg");
    for kind in [raster_kind(png_bytes()), shojiku_image::AssetKind::Svg(svg)] {
        let assets = store_with("faded", kind);
        let mut s = shape("faded", 50.0, 50.0);
        s.opacity = 0.4;
        let doc = image_doc(s);
        let bytes = render_pdf(&doc, fonts, &assets).expect("render");
        assert!(bytes.starts_with(b"%PDF-"));
    }
}

#[test]
fn unknown_asset_id_is_an_error() {
    let (_pack, fonts) = shared_fonts();
    let doc = image_doc(shape("ghost", 10.0, 10.0));
    assert!(matches!(
        render_pdf(&doc, fonts, &AssetStore::empty()),
        Err(RenderError::UnknownAsset(id)) if id == "ghost"
    ));
}

#[test]
fn undecodable_raster_bytes_are_an_error() {
    let (_pack, fonts) = shared_fonts();
    // Every format constructor must reject junk (the store's format
    // tag is data-derived, but the decoder still owns validation).
    for format in [
        RasterFormat::Png,
        RasterFormat::Jpeg,
        RasterFormat::Gif,
        RasterFormat::Webp,
    ] {
        let assets = store_with(
            "bad",
            shojiku_image::AssetKind::Raster {
                format,
                bytes: std::sync::Arc::new(b"not an image".to_vec()),
                width_px: 1,
                height_px: 1,
            },
        );
        let doc = image_doc(shape("bad", 10.0, 10.0));
        let err = render_pdf(&doc, fonts, &assets).expect_err("junk bytes");
        assert!(matches!(&err, RenderError::BadImage { id, .. } if id == "bad"));
        assert!(err.to_string().contains("bad"));
    }
}

#[test]
fn degenerate_image_shapes_are_skipped() {
    let (_pack, fonts) = shared_fonts();
    let assets = store_with("ok", raster_kind(png_bytes()));

    // Non-finite / non-positive rects skip before any decode.
    for (w, h) in [(f64::NAN, 10.0), (0.0, 10.0), (10.0, -1.0)] {
        let doc = image_doc(shape("ok", w, h));
        let bytes = render_pdf(&doc, fonts, &assets).expect("render");
        assert!(bytes.starts_with(b"%PDF-"));
    }

    // Finite in f64 but infinite as f32: krilla's Size rejects it
    // after the decode, exercising the size fallback.
    let doc = image_doc(shape("ok", 1e300, 10.0));
    let bytes = render_pdf(&doc, fonts, &assets).expect("render");
    assert!(bytes.starts_with(b"%PDF-"));
}
