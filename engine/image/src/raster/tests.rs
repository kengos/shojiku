//! Unit tests for raster format sniffing and header-only dimension checks.

use super::test_support::{gif_with_frame, tiny_png};
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

#[test]
fn a_gif_whose_first_frame_is_the_logical_screen_is_accepted() {
    check_gif_first_frame(&gif_with_frame((4, 3), (0, 0, 4, 3)))
        .expect("the frame fills the screen");
}

#[test]
fn a_gif_whose_first_frame_differs_from_the_logical_screen_is_refused() {
    // Larger, smaller, and offset in each direction.
    for (screen, frame) in [
        ((1, 1), (0, 0, 100, 100)),
        ((100, 100), (0, 0, 1, 1)),
        ((4, 4), (1, 0, 3, 4)),
        ((4, 4), (0, 1, 4, 3)),
    ] {
        let err = check_gif_first_frame(&gif_with_frame(screen, frame))
            .expect_err("a frame other than the screen is refused");
        assert!(
            matches!(&err, ImageError::Bad(m) if m.contains("differs from the")),
            "{screen:?} {frame:?}: {err}"
        );
    }
    let err =
        check_gif_first_frame(&gif_with_frame((1, 1), (0, 0, 100, 100))).expect_err("refused");
    assert_eq!(
        err.to_string(),
        "unsupported or malformed image data: gif first frame (100x100 at 0,0) differs from the 1x1 logical screen"
    );
}

#[test]
fn a_gif_without_a_readable_first_frame_is_refused() {
    // The header ends after the screen size, before the flags byte.
    assert!(matches!(
        check_gif_first_frame(b"GIF89a\x01\x00\x01\x00"),
        Err(ImageError::Bad(_))
    ));
    // A complete header and trailer with no frame between them: the gif
    // crate reports the trailer as an unexpected end of file, so the
    // refusal carries its text rather than "gif has no frames".
    let mut empty = Vec::new();
    {
        gif::Encoder::new(&mut empty, 1, 1, &[0, 0, 0]).expect("gif encoder");
    }
    assert!(matches!(
        check_gif_first_frame(&empty),
        Err(ImageError::Bad(m)) if m.contains("Unexpected End of File")
    ));
    // An unknown block where the first frame should start.
    let mut unknown = empty.clone();
    *unknown.last_mut().expect("the trailer byte") = 0x99;
    assert!(matches!(
        check_gif_first_frame(&unknown),
        Err(ImageError::Bad(_))
    ));
}
