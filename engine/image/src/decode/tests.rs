//! Unit tests for raster decoding across all four codecs.

use super::*;

/// Encodes an RGBA8 buffer as PNG with the given color type so tests
/// exercise every channel-count path through `expand_to_rgba`.
fn png_bytes(width: u32, height: u32, color: png::ColorType, data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, width, height);
    encoder.set_color(color);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().expect("png header");
    writer.write_image_data(data).expect("png data");
    writer.finish().expect("png finish");
    out
}

#[test]
fn png_gray_gray_alpha_rgb_rgba_all_expand() {
    // Grayscale (1ch): mid-gray expands to opaque gray.
    let img = decode_raster(
        RasterFormat::Png,
        &png_bytes(2, 1, png::ColorType::Grayscale, &[0x40, 0x80]),
    )
    .expect("gray");
    assert_eq!((img.width, img.height), (2, 1));
    assert_eq!(img.rgba, vec![0x40, 0x40, 0x40, 255, 0x80, 0x80, 0x80, 255]);

    // Grayscale + alpha (2ch).
    let img = decode_raster(
        RasterFormat::Png,
        &png_bytes(1, 1, png::ColorType::GrayscaleAlpha, &[0x30, 0x7f]),
    )
    .expect("gray-alpha");
    assert_eq!(img.rgba, vec![0x30, 0x30, 0x30, 0x7f]);

    // RGB (3ch) -> opaque.
    let img = decode_raster(
        RasterFormat::Png,
        &png_bytes(1, 1, png::ColorType::Rgb, &[10, 20, 30]),
    )
    .expect("rgb");
    assert_eq!(img.rgba, vec![10, 20, 30, 255]);

    // RGBA (4ch) -> passthrough.
    let img = decode_raster(
        RasterFormat::Png,
        &png_bytes(1, 1, png::ColorType::Rgba, &[10, 20, 30, 40]),
    )
    .expect("rgba");
    assert_eq!(img.rgba, vec![10, 20, 30, 40]);
}

#[test]
fn png_indexed_is_expanded_to_rgb() {
    // A paletted PNG: EXPAND must turn it into RGB samples, so the
    // channel-count path never sees an indexed type.
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, 1, 1);
    encoder.set_color(png::ColorType::Indexed);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_palette(vec![255, 0, 0]);
    let mut writer = encoder.write_header().expect("header");
    writer.write_image_data(&[0]).expect("data");
    writer.finish().expect("finish");
    let img = decode_raster(RasterFormat::Png, &out).expect("indexed");
    assert_eq!(img.rgba, vec![255, 0, 0, 255]);
}

/// A tiny 4x3 solid JPEG (generated once with `sips`; JPEG has no
/// pure-Rust encoder in the tree). Colors are approximate after lossy
/// compression, so tests assert structure, not exact bytes.
const TINY_JPEG_B64: &str = "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAAAwAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAwAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A8Pooor+dz/SA/9k=";

fn jpeg_bytes() -> Vec<u8> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    STANDARD.decode(TINY_JPEG_B64).expect("jpeg fixture")
}

#[test]
fn decodes_jpeg_to_opaque_rgba() {
    let img = decode_raster(RasterFormat::Jpeg, &jpeg_bytes()).expect("jpeg");
    assert_eq!((img.width, img.height), (4, 3));
    assert_eq!(img.rgba.len(), 4 * 3 * 4);
    // Forced-RGB decode is always opaque.
    assert!(img.rgba.chunks_exact(4).all(|px| px[3] == 255));
    // Solid warm fill: red dominates the (lossy) output.
    let first = &img.rgba[0..3];
    assert!(first[0] > first[2], "expected reddish pixel: {first:?}");
}

fn gif_bytes() -> Vec<u8> {
    // 2x1: one red pixel, one green, via the palette.
    let mut out = Vec::new();
    {
        let palette = [255, 0, 0, 0, 255, 0];
        let mut encoder = gif::Encoder::new(&mut out, 2, 1, &palette).expect("gif encoder");
        let frame = gif::Frame {
            width: 2,
            height: 1,
            buffer: std::borrow::Cow::Borrowed(&[0, 1]),
            ..Default::default()
        };
        encoder.write_frame(&frame).expect("gif frame");
    }
    out
}

#[test]
fn decodes_gif_first_frame_to_rgba() {
    let img = decode_raster(RasterFormat::Gif, &gif_bytes()).expect("gif");
    assert_eq!((img.width, img.height), (2, 1));
    assert_eq!(&img.rgba[0..4], &[255, 0, 0, 255]);
    assert_eq!(&img.rgba[4..8], &[0, 255, 0, 255]);
}

fn webp_bytes(color: image_webp::ColorType, data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let encoder = image_webp::WebPEncoder::new(Cursor::new(&mut out));
    encoder.encode(data, 2, 1, color).expect("webp encode");
    out
}

#[test]
fn decodes_webp_rgb_and_rgba() {
    // Opaque (RGB) path.
    let img = decode_raster(
        RasterFormat::Webp,
        &webp_bytes(image_webp::ColorType::Rgb8, &[10, 20, 30, 40, 50, 60]),
    )
    .expect("webp rgb");
    assert_eq!((img.width, img.height), (2, 1));
    assert_eq!(&img.rgba[0..4], &[10, 20, 30, 255]);

    // Alpha path.
    let img = decode_raster(
        RasterFormat::Webp,
        &webp_bytes(
            image_webp::ColorType::Rgba8,
            &[10, 20, 30, 128, 0, 0, 0, 255],
        ),
    )
    .expect("webp rgba");
    assert_eq!(&img.rgba[0..4], &[10, 20, 30, 128]);
}

#[test]
fn every_format_rejects_junk() {
    for format in [
        RasterFormat::Png,
        RasterFormat::Jpeg,
        RasterFormat::Gif,
        RasterFormat::Webp,
    ] {
        assert!(matches!(
            decode_raster(format, b"not an image at all"),
            Err(ImageError::Bad(_))
        ));
    }
}

#[test]
fn codec_err_wraps_any_display() {
    let err = codec_err("boom");
    assert!(matches!(err, ImageError::Bad(msg) if msg == "boom"));
}

#[test]
fn expand_rejects_bad_channel_counts() {
    assert!(matches!(
        expand_to_rgba(&[1, 2, 3, 4, 5], 0),
        Err(ImageError::Bad(_))
    ));
    assert!(matches!(
        expand_to_rgba(&[1, 2, 3, 4, 5], 5),
        Err(ImageError::Bad(_))
    ));
}

#[test]
fn a_codec_message_is_bounded_before_it_becomes_an_engine_error() {
    // `codec_err` is the ONE place a third-party decoder's text enters an
    // engine error, and that text is derived from bytes the document chose.
    // Four codecs route through it, so bounding it here is what keeps any of
    // them from writing an unbounded — or escape-bearing — message into the
    // single `detail` arg it ends up composed into.
    let hostile = format!("\u{1b}[2J{}", "q".repeat(10_000));
    let ImageError::Bad(message) = codec_err(hostile) else {
        panic!("codec errors map to ImageError::Bad");
    };
    assert!(
        !message.chars().any(char::is_control),
        "a codec message carried a control character: {message:?}"
    );
    assert_eq!(
        message.chars().count(),
        shojiku_diagnostics::MAX_INLINE_ECHO + 1,
        "80 characters plus the truncation marker"
    );
}
