//! The raster harness the `image_raster` fuzz target and the corpus replay
//! test both run.
//!
//! `kind_from_bytes` classifies every image byte string: a raster by magic
//! bytes, with its dimensions read from the header and capped by the
//! policy's `max_pixels`, else an SVG when it starts with markup. Layout
//! sizes an accepted raster by those header dimensions, and the PNG backend
//! decodes it with `decode_raster`, so the harness asserts that the header
//! size and the decoded size are equal and that the decoded buffer has four
//! bytes per pixel; the size equality and the four bytes per pixel are the
//! properties checked independently of the engine's own checks. The harness
//! also repeats the engine's acceptance checks as regression checks (the
//! sniffed format, a non-zero size within the pixel cap, a GIF first frame
//! covering exactly its logical screen), and asserts that a `Bad` error
//! message is at most `MAX_MESSAGE` characters with no control character
//! and that the same input gives the same result twice.

use super::tree::assert_tree;
use crate::error::ImageError;
use crate::policy::AssetPolicy;
use crate::prepare::kind_from_bytes;
use crate::store::AssetKind;
use crate::{RasterFormat, decode_raster, sniff};
use shojiku_diagnostics::MAX_INLINE_ECHO;

#[cfg(test)]
mod tests;

/// The `max_pixels` caps the first input byte selects from (by its value
/// modulo the number of caps, 4): the default policy's cap, then caps
/// small enough that a seed of a few hundred bytes can exceed them.
const MAX_PIXELS: [u64; 4] = [40_000_000, 1_000_000, 4096, 1];

/// The longest fixed text a raster error message puts before an echoed
/// codec or header message (`"cannot read image dimensions: "`).
const LONGEST_PREFIX: usize = 30;

/// The longest raster error message, in characters: the prefix, an echo
/// clipped to `MAX_INLINE_ECHO`, and the `…` that marks the clip.
const MAX_MESSAGE: usize = LONGEST_PREFIX + MAX_INLINE_ECHO + 1;

/// Which branches one input ran, for the replay test's positive controls.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct RasterPaths {
    /// A PNG was accepted and decoded.
    pub png: bool,
    /// A JPEG was accepted and decoded.
    pub jpeg: bool,
    /// A GIF was accepted and decoded.
    pub gif: bool,
    /// A WebP was accepted and decoded.
    pub webp: bool,
    /// A raster was refused for exceeding the pixel cap.
    pub pixel_refused: bool,
    /// A raster was accepted from its header but failed to decode.
    pub decode_failed: bool,
    /// A GIF was refused because its first frame is not its logical screen.
    pub gif_frame_refused: bool,
    /// The bytes had no raster magic, started with `<`, and `parse_svg`
    /// accepted them.
    pub svg: bool,
}

/// What one run produced, compared between two runs of the same input.
#[derive(Debug, PartialEq)]
enum Outcome {
    /// An accepted raster: format, header size, and the decode result.
    Raster(
        RasterFormat,
        (u64, u64),
        Result<(u32, u32, Vec<u8>), String>,
    ),
    /// An accepted SVG, by its `Debug` text.
    Svg(String),
    /// A refusal, by its `Debug` text.
    Refused(String),
}

/// Runs one fuzz input through the raster classifier and, when it accepts
/// a raster, the decoder: the first byte selects the pixel cap from
/// [`MAX_PIXELS`], the rest are the image bytes.
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn raster(data: &[u8]) -> RasterPaths {
    let Some((&select, bytes)) = data.split_first() else {
        return RasterPaths::default();
    };
    let policy = AssetPolicy {
        max_pixels: MAX_PIXELS[usize::from(select) % MAX_PIXELS.len()],
        ..AssetPolicy::default()
    };
    let (outcome, paths) = run(bytes, &policy);
    assert!(
        outcome == run(bytes, &policy).0,
        "classifying and decoding the same bytes twice gave different results"
    );
    paths
}

/// One classification and, for a raster, one decode, asserting each
/// property on the classification and decode results.
fn run(bytes: &[u8], policy: &AssetPolicy) -> (Outcome, RasterPaths) {
    let mut paths = RasterPaths::default();
    let outcome = match kind_from_bytes(bytes.to_vec(), policy) {
        Ok(AssetKind::Raster {
            format,
            width_px,
            height_px,
            ..
        }) => {
            let size = (width_px, height_px);
            assert_accepted(bytes, format, size, policy.max_pixels);
            let decoded = decode(bytes, format, size, &mut paths);
            Outcome::Raster(format, size, decoded)
        }
        Ok(AssetKind::Svg(tree)) => {
            assert_eq!(
                sniff(bytes),
                None,
                "bytes with raster magic were parsed as SVG"
            );
            assert_tree(&tree, bytes.len());
            paths.svg = true;
            Outcome::Svg(format!("{tree:?}"))
        }
        Err(err) => {
            assert_error(&err, policy.max_pixels);
            paths.pixel_refused = matches!(err, ImageError::TooManyPixels { .. });
            paths.gif_frame_refused =
                matches!(&err, ImageError::Bad(m) if m.starts_with("gif first frame"));
            Outcome::Refused(format!("{err:?}"))
        }
    };
    (outcome, paths)
}

/// Asserts an accepted raster: its format is what the magic bytes say, its
/// header size is non-zero and within the pixel cap, and a GIF's first
/// frame is placed at the origin with the logical screen's size.
fn assert_accepted(bytes: &[u8], format: RasterFormat, (w, h): (u64, u64), max_pixels: u64) {
    assert_eq!(
        sniff(bytes),
        Some(format),
        "the accepted format is not the sniffed one"
    );
    assert!(w > 0 && h > 0, "an accepted raster is {w}x{h}");
    assert!(
        w.saturating_mul(h) <= max_pixels,
        "an accepted {w}x{h} raster exceeds the {max_pixels} pixel cap"
    );
    if format == RasterFormat::Gif {
        let mut options = gif::DecodeOptions::new();
        options.skip_frame_decoding(true);
        let mut decoder = options
            .read_info(bytes)
            .expect("an accepted GIF has a readable header");
        let screen = (u64::from(decoder.width()), u64::from(decoder.height()));
        assert_eq!(
            screen,
            (w, h),
            "the GIF header size is not its logical screen"
        );
        let frame = decoder
            .next_frame_info()
            .expect("an accepted GIF has a readable first frame")
            .expect("an accepted GIF has a first frame");
        assert_eq!(
            (
                frame.left,
                frame.top,
                u64::from(frame.width),
                u64::from(frame.height)
            ),
            (0, 0, w, h),
            "an accepted GIF's first frame does not cover its logical screen"
        );
    }
}

/// Decodes an accepted raster and asserts the decoded image has the
/// header's size and four bytes per pixel; a decode error is checked by
/// [`assert_error`] (message length and control characters).
fn decode(
    bytes: &[u8],
    format: RasterFormat,
    (w, h): (u64, u64),
    paths: &mut RasterPaths,
) -> Result<(u32, u32, Vec<u8>), String> {
    match decode_raster(format, bytes) {
        Ok(image) => {
            assert_eq!(
                (u64::from(image.width), u64::from(image.height)),
                (w, h),
                "the decoded {format:?} size differs from its header size"
            );
            assert_eq!(
                image.rgba.len() as u64,
                w * h * 4,
                "the decoded {format:?} buffer is not four bytes per pixel"
            );
            match format {
                RasterFormat::Png => paths.png = true,
                RasterFormat::Jpeg => paths.jpeg = true,
                RasterFormat::Gif => paths.gif = true,
                RasterFormat::Webp => paths.webp = true,
            }
            Ok((image.width, image.height, image.rgba))
        }
        Err(err) => {
            assert_error(&err, u64::MAX);
            paths.decode_failed = true;
            Err(format!("{err:?}"))
        }
    }
}

/// Asserts a raster error: an [`ImageError::Bad`] message of at most
/// [`MAX_MESSAGE`] characters with no control character, and a pixel-cap
/// refusal whose size really exceeds `max_pixels`. An [`ImageError::Svg`]
/// message is not checked.
fn assert_error(err: &ImageError, max_pixels: u64) {
    if let ImageError::TooManyPixels { width, height, cap } = *err {
        assert_eq!(cap, max_pixels, "the pixel-cap refusal names another cap");
        assert!(
            width.saturating_mul(height) > cap,
            "a {width}x{height} raster was refused under the {cap} pixel cap"
        );
    }
    if let ImageError::Bad(message) = err {
        assert!(
            message.chars().count() <= MAX_MESSAGE,
            "the error message is over {MAX_MESSAGE} characters: {message:?}"
        );
        assert!(
            !message.chars().any(char::is_control),
            "the error message contains a control character: {message:?}"
        );
    }
}
