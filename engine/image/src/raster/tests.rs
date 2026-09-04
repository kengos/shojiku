//! Unit tests for raster format sniffing and header-only dimension checks.

use super::test_support::tiny_png;
use super::*;

#[test]
fn sniffs_magic_bytes() {
    assert_eq!(sniff(&tiny_png(1, 1)), Some(RasterFormat::Png));
    assert_eq!(sniff(&[0xFF, 0xD8, 0xFF, 0xE0]), Some(RasterFormat::Jpeg));
    assert_eq!(sniff(b"GIF87a rest"), Some(RasterFormat::Gif));
    assert_eq!(sniff(b"GIF89a rest"), Some(RasterFormat::Gif));
    assert_eq!(
        sniff(b"RIFF\x00\x00\x00\x00WEBPVP8 "),
        Some(RasterFormat::Webp)
    );
    assert_eq!(sniff(b"plain text"), None);
    assert_eq!(sniff(b""), None);
}

#[test]
fn reads_dimensions_from_header() {
    let png = tiny_png(3, 2);
    assert_eq!(checked_dimensions(&png, 1000).expect("dims"), (3, 2));
}

#[test]
fn enforces_pixel_cap() {
    let png = tiny_png(10, 10);
    assert!(matches!(
        checked_dimensions(&png, 99),
        Err(ImageError::TooManyPixels {
            width: 10,
            height: 10,
            cap: 99
        })
    ));
}

#[test]
fn rejects_undecodable_headers() {
    assert!(matches!(
        checked_dimensions(b"not an image", 1000),
        Err(ImageError::Bad(_))
    ));
}

#[test]
fn rejects_zero_dimensions() {
    // A PNG header claiming 0x0 — imagesize reads the IHDR verbatim.
    let png = tiny_png(0, 0);
    assert!(matches!(
        checked_dimensions(&png, 1000),
        Err(ImageError::Bad(msg)) if msg.contains("zero")
    ));
}
