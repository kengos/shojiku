//! Unit tests for the raster harness: the branch each kind of input runs,
//! and that each asserted property fails on bytes or results that break it.

use super::*;
use crate::raster::test_support::{gif_with_frame, jpeg_bytes, tiny_png};
use std::io::Cursor;

/// `bytes` prefixed with the selector byte 0, which selects the default
/// pixel cap (`MAX_PIXELS[0]`).
fn with_default_cap(bytes: &[u8]) -> Vec<u8> {
    let mut data = vec![0];
    data.extend_from_slice(bytes);
    data
}

/// A 2x1 opaque WebP.
fn webp() -> Vec<u8> {
    let mut out = Vec::new();
    image_webp::WebPEncoder::new(Cursor::new(&mut out))
        .encode(&[10, 20, 30, 40, 50, 60], 2, 1, image_webp::ColorType::Rgb8)
        .expect("webp encode");
    out
}

#[test]
fn each_raster_format_is_accepted_and_decoded_at_its_header_size() {
    let png = raster(&with_default_cap(&tiny_png(2, 3)));
    assert!(png.png && !png.decode_failed, "{png:?}");
    assert!(raster(&with_default_cap(&jpeg_bytes())).jpeg);
    assert!(raster(&with_default_cap(&gif_with_frame((2, 2), (0, 0, 2, 2)))).gif);
    assert!(raster(&with_default_cap(&webp())).webp);
}

#[test]
fn the_selector_byte_selects_max_pixels_by_its_value_modulo_four() {
    let png = tiny_png(2, 2);
    for select in [3_u8, 7, 255] {
        let mut data = vec![select];
        data.extend_from_slice(&png);
        assert_eq!(
            raster(&data),
            RasterPaths {
                pixel_refused: true,
                ..RasterPaths::default()
            },
            "selector {select}"
        );
    }
    let mut data = vec![2_u8];
    data.extend_from_slice(&png);
    assert!(raster(&data).png, "a 4-pixel PNG is within the 4096 cap");
}

#[test]
fn a_raster_with_a_readable_header_and_broken_data_fails_to_decode() {
    let png = tiny_png(4, 4);
    let paths = raster(&with_default_cap(&png[..png.len() - 20]));
    assert_eq!(
        paths,
        RasterPaths {
            decode_failed: true,
            ..RasterPaths::default()
        }
    );
}

#[test]
fn a_gif_whose_first_frame_is_offset_is_refused() {
    let paths = raster(&with_default_cap(&gif_with_frame((4, 4), (1, 1, 2, 2))));
    assert_eq!(
        paths,
        RasterPaths {
            gif_frame_refused: true,
            ..RasterPaths::default()
        }
    );
}

#[test]
fn markup_is_parsed_as_svg_junk_is_refused_and_empty_input_runs_no_branch() {
    let svg = r#"<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>"#;
    assert!(raster(&with_default_cap(svg.as_bytes())).svg);
    assert_eq!(
        raster(&with_default_cap(b"not an image")),
        RasterPaths::default()
    );
    assert_eq!(raster(&[]), RasterPaths::default());
}

#[test]
#[should_panic(expected = "exceeds the 1 pixel cap")]
fn an_accepted_size_over_the_cap_fails_the_pixel_check() {
    assert_accepted(&tiny_png(2, 2), RasterFormat::Png, (2, 2), 1);
}

#[test]
#[should_panic(expected = "is not the sniffed one")]
fn an_accepted_format_other_than_the_sniffed_format_fails() {
    assert_accepted(&tiny_png(2, 2), RasterFormat::Gif, (2, 2), u64::MAX);
}

#[test]
#[should_panic(expected = "an accepted raster is 0x2")]
fn an_accepted_zero_size_fails() {
    assert_accepted(&tiny_png(2, 2), RasterFormat::Png, (0, 2), u64::MAX);
}

#[test]
#[should_panic(expected = "does not cover its logical screen")]
fn an_accepted_gif_with_an_offset_frame_fails_the_frame_check() {
    let gif = gif_with_frame((4, 4), (1, 1, 2, 2));
    assert_accepted(&gif, RasterFormat::Gif, (4, 4), u64::MAX);
}

#[test]
#[should_panic(expected = "is not its logical screen")]
fn an_accepted_gif_size_other_than_its_screen_fails() {
    let gif = gif_with_frame((2, 2), (0, 0, 2, 2));
    assert_accepted(&gif, RasterFormat::Gif, (3, 2), u64::MAX);
}

#[test]
#[should_panic(expected = "differs from its header size")]
fn a_decoded_size_other_than_the_header_size_fails() {
    let _ = decode(
        &tiny_png(2, 2),
        RasterFormat::Png,
        (3, 3),
        &mut RasterPaths::default(),
    );
}

#[test]
#[should_panic(expected = "is over 111 characters")]
fn an_error_message_over_max_message_characters_fails() {
    assert_error(&ImageError::Bad("x".repeat(MAX_MESSAGE + 1)), u64::MAX);
}

#[test]
#[should_panic(expected = "contains a control character")]
fn an_error_message_with_a_control_character_fails() {
    assert_error(&ImageError::Bad("bad\nmessage".to_string()), u64::MAX);
}

#[test]
#[should_panic(expected = "names another cap")]
fn a_pixel_refusal_under_another_cap_fails() {
    let err = ImageError::TooManyPixels {
        width: 2,
        height: 2,
        cap: 1,
    };
    assert_error(&err, 3);
}

#[test]
#[should_panic(expected = "was refused under the 8 pixel cap")]
fn a_pixel_refusal_of_a_size_within_the_cap_fails() {
    let err = ImageError::TooManyPixels {
        width: 2,
        height: 2,
        cap: 8,
    };
    assert_error(&err, 8);
}

#[test]
fn the_longest_gif_first_frame_message_is_within_max_message() {
    // The GIF frame message carries no echo; its longest form must be
    // within `MAX_MESSAGE`, or `assert_error` would panic on a correct GIF
    // refusal.
    let longest = "gif first frame (65535x65535 at 65535,65535) differs from the 65535x65535 \
                   logical screen";
    assert!(longest.chars().count() <= MAX_MESSAGE);
    assert_error(&ImageError::Bad(longest.to_string()), u64::MAX);
}
