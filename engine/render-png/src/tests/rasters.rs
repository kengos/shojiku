//! Raster decode integration across all four codecs.

use super::*;

/// A tiny JPEG (see decode.rs for provenance).
const TINY_JPEG_B64: &str = "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAAAwAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAwAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A8Pooor+dz/SA/9k=";

/// Inserts a raster asset of each format into a store, decoded from
/// encoder-built fixtures, and renders them so the render-png-linked
/// copy of shojiku-image exercises every decoder (not just PNG).
#[test]
fn renders_every_raster_format_and_a_line() {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    let png = {
        let mut o = Vec::new();
        let mut e = png::Encoder::new(&mut o, 1, 1);
        e.set_color(png::ColorType::Rgb);
        e.set_depth(png::BitDepth::Eight);
        let mut w = e.write_header().expect("h");
        w.write_image_data(&[0, 0, 255]).expect("d");
        w.finish().expect("f");
        o
    };
    let jpeg = STANDARD.decode(TINY_JPEG_B64).expect("jpeg");
    let gif = {
        let mut o = Vec::new();
        {
            let pal = [0, 0, 255, 255, 0, 0];
            let mut e = gif::Encoder::new(&mut o, 2, 1, &pal).expect("e");
            let f = gif::Frame {
                width: 2,
                height: 1,
                buffer: std::borrow::Cow::Borrowed(&[0, 1]),
                ..Default::default()
            };
            e.write_frame(&f).expect("wf");
        }
        o
    };
    let webp = {
        let mut o = Vec::new();
        image_webp::WebPEncoder::new(std::io::Cursor::new(&mut o))
            .encode(&[0, 0, 255, 200, 0, 100], 2, 1, image_webp::ColorType::Rgb8)
            .expect("webp");
        o
    };

    let mut store = AssetStore::empty();
    for (id, bytes) in [("p", png), ("j", jpeg), ("g", gif), ("w", webp)] {
        store.insert(shojiku_image::Asset {
            id: id.to_string(),
            kind: AssetKind::Raster {
                format: shojiku_image::sniff(&bytes).expect("format"),
                bytes: std::sync::Arc::new(bytes),
                width_px: 1,
                height_px: 1,
            },
        });
    }

    let mut doc = base_doc();
    for (i, id) in ["p", "j", "g", "w"].iter().enumerate() {
        doc.pages[0].items.push(LayoutItem::Image(ImageShape {
            asset_id: id.to_string(),
            opacity: 1.0,
            link: None,
            x: i as f64 * 20.0,
            y: 0.0,
            w: 15.0,
            h: 15.0,
        }));
    }
    doc.pages[0].items.push(LayoutItem::Line(LineShape {
        x1: 0.0,
        y1: 90.0,
        x2: 90.0,
        y2: 90.0,
        width: 2.0,
        color: (0.0, 0.0, 0.0),
        opacity: 1.0,
        ..Default::default()
    }));
    // A stroked (bordered) rect so draw_rect's stroke branch runs in
    // this crate's own test binary, not only via a dependent's tables.
    doc.pages[0].items.push(LayoutItem::Rect(RectShape {
        x: 5.0,
        y: 40.0,
        w: 30.0,
        h: 20.0,
        stroke: Some((0.0, 0.0, 0.0)),
        stroke_width: 1.5,
        fill: Some((0.9, 0.9, 0.9)),
        opacity: 1.0,
        ..Default::default()
    }));

    let pages = render_png(&doc, fonts(), &store, &PngOptions::default()).expect("render");
    assert_eq!(pages.len(), 1);
    assert!(pages[0].starts_with(b"\x89PNG"));
}

#[test]
fn draw_raster_skips_corrupt_buffer() {
    // A raster whose buffer length disagrees with its dimensions is
    // skipped rather than drawn or panicked on.
    let store = AssetStore::empty();
    let painter = Painter {
        fonts: fonts(),
        assets: &store,
        transform: Transform::from_scale(1.0, 1.0),
        glyph_cache: HashMap::new(),
    };
    let mut pixmap = Pixmap::new(10, 10).expect("pixmap");
    pixmap.fill(Color::WHITE);
    let corrupt = RgbaImage {
        width: 2,
        height: 2,
        rgba: vec![0; 3],
    };
    let shape = ImageShape {
        asset_id: "x".to_string(),
        opacity: 1.0,
        link: None,
        x: 0.0,
        y: 0.0,
        w: 10.0,
        h: 10.0,
    };
    painter.draw_raster(&mut pixmap, &corrupt, &shape, None);
    // Untouched: top-left stays white.
    assert_eq!(
        pixmap.pixels()[0],
        tiny_skia::PremultipliedColorU8::from_rgba(255, 255, 255, 255).expect("white")
    );
}

#[test]
fn draw_raster_applies_whole_image_opacity() {
    let store = AssetStore::empty();
    let painter = Painter {
        fonts: fonts(),
        assets: &store,
        transform: Transform::from_scale(1.0, 1.0),
        glyph_cache: HashMap::new(),
    };
    let mut pixmap = Pixmap::new(10, 10).expect("pixmap");
    pixmap.fill(Color::WHITE);
    // An opaque blue 1x1 raster drawn at half opacity over white.
    let blue = RgbaImage {
        width: 1,
        height: 1,
        rgba: vec![0, 0, 255, 255],
    };
    let shape = ImageShape {
        asset_id: "x".to_string(),
        opacity: 0.5,
        link: None,
        x: 0.0,
        y: 0.0,
        w: 10.0,
        h: 10.0,
    };
    painter.draw_raster(&mut pixmap, &blue, &shape, None);
    // 0.5*blue + 0.5*white ≈ (127, 127, 255): blue dominates, white shows.
    let px = pixmap.pixels()[0];
    assert!(px.blue() > px.red(), "blue channel dominates: {px:?}");
    assert!(px.red() > 100, "white shows through at half alpha: {px:?}");
}
