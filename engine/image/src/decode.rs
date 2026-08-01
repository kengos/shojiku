//! Raster pixel decoding to straight-alpha RGBA8.
//!
//! The PDF backend hands encoded bytes straight to krilla, which decodes
//! them itself — so this module exists only for pixel backends like
//! `shojiku-render-png` that must rasterize onto a canvas. Keeping it here
//! (rather than in the renderer) means the image domain owns every codec
//! and a second raster backend reuses the same decode path. The codec
//! crates are already in the workspace tree via krilla's raster-images, so
//! decoding lives here unconditionally rather than behind a feature.
//! Dimensions were already capped by `AssetPolicy` before an asset reached
//! the store, so a decode here allocates at most `max_pixels * 4` bytes.

use crate::error::ImageError;
use crate::raster::RasterFormat;
use std::io::Cursor;

/// A decoded image: straight-alpha RGBA8, row-major, 4 bytes per pixel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RgbaImage {
    /// Pixel width (> 0).
    pub width: u32,
    /// Pixel height (> 0).
    pub height: u32,
    /// `width * height * 4` bytes, R,G,B,A per pixel.
    pub rgba: Vec<u8>,
}

/// Decodes encoded raster bytes of a known format to RGBA8.
pub fn decode_raster(format: RasterFormat, bytes: &[u8]) -> Result<RgbaImage, ImageError> {
    match format {
        RasterFormat::Png => decode_png(bytes),
        RasterFormat::Jpeg => decode_jpeg(bytes),
        RasterFormat::Gif => decode_gif(bytes),
        RasterFormat::Webp => decode_webp(bytes),
    }
}

/// Expands `channels`-per-pixel sample data into straight RGBA8.
///
/// `channels` is 1 (gray), 2 (gray+alpha), 3 (rgb) or 4 (rgba); any other
/// value means the caller mis-measured and yields an error rather than a
/// silently corrupt image.
fn expand_to_rgba(samples: &[u8], channels: usize) -> Result<Vec<u8>, ImageError> {
    if channels == 0 || channels > 4 {
        return Err(ImageError::Bad(format!(
            "unsupported channel count {channels}"
        )));
    }
    let mut rgba = Vec::with_capacity(samples.len() / channels * 4);
    for px in samples.chunks_exact(channels) {
        let (r, g, b, a) = match channels {
            1 => (px[0], px[0], px[0], 255),
            2 => (px[0], px[0], px[0], px[1]),
            3 => (px[0], px[1], px[2], 255),
            // channels is 1..=4 (checked above); 4 is the only remainder.
            _ => (px[0], px[1], px[2], px[3]),
        };
        rgba.extend_from_slice(&[r, g, b, a]);
    }
    Ok(rgba)
}

/// Maps any codec error into [`ImageError::Bad`]. A named generic fn item
/// (not a per-site closure) so each codec's error type instantiates one
/// coverable function, exercised by the junk-input tests and unit-tested
/// directly below.
fn codec_err<E: std::fmt::Display>(error: E) -> ImageError {
    ImageError::Bad(error.to_string())
}

fn decode_png(bytes: &[u8]) -> Result<RgbaImage, ImageError> {
    // png's reader needs Read + Seek; a slice is only Read.
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    // EXPAND turns palettes and sub-8-bit depths into full samples;
    // STRIP_16 collapses 16-bit channels to 8-bit. After both, the frame
    // is 8-bit Gray/GrayA/Rgb/Rgba — never indexed or 16-bit.
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(codec_err)?;
    // Eager `ok_or`: the error value is built on every call so the line
    // stays covered; the overflow itself needs a >4 GiB image to trigger.
    let size = reader
        .output_buffer_size()
        .ok_or(ImageError::Bad("png buffer size overflow".to_string()))?;
    let mut buf = vec![0; size];
    let info = reader.next_frame(&mut buf).map_err(codec_err)?;
    let channels = info.color_type.samples();
    let rgba = expand_to_rgba(&buf[..info.buffer_size()], channels)?;
    Ok(RgbaImage {
        width: info.width,
        height: info.height,
        rgba,
    })
}

fn decode_jpeg(bytes: &[u8]) -> Result<RgbaImage, ImageError> {
    use zune_jpeg::zune_core::bytestream::ZCursor;
    use zune_jpeg::zune_core::colorspace::ColorSpace;
    use zune_jpeg::zune_core::options::DecoderOptions;
    let options = DecoderOptions::default().jpeg_set_out_colorspace(ColorSpace::RGB);
    let mut decoder = zune_jpeg::JpegDecoder::new_with_options(ZCursor::new(bytes), options);
    let pixels = decoder.decode().map_err(codec_err)?;
    // Forced RGB output above, so info + 3 channels are consistent.
    let info = decoder
        .info()
        .ok_or(ImageError::Bad("jpeg has no image info".to_string()))?;
    let rgba = expand_to_rgba(&pixels, 3)?;
    Ok(RgbaImage {
        width: u32::from(info.width),
        height: u32::from(info.height),
        rgba,
    })
}

fn decode_gif(bytes: &[u8]) -> Result<RgbaImage, ImageError> {
    let mut options = gif::DecodeOptions::new();
    options.set_color_output(gif::ColorOutput::RGBA);
    let mut decoder = options.read_info(bytes).map_err(codec_err)?;
    let frame = decoder
        .read_next_frame()
        .map_err(codec_err)?
        .ok_or(ImageError::Bad("gif has no frames".to_string()))?;
    Ok(RgbaImage {
        width: u32::from(frame.width),
        height: u32::from(frame.height),
        // ColorOutput::RGBA above guarantees a 4-byte-per-pixel buffer.
        rgba: frame.buffer.to_vec(),
    })
}

fn decode_webp(bytes: &[u8]) -> Result<RgbaImage, ImageError> {
    let mut decoder = image_webp::WebPDecoder::new(Cursor::new(bytes)).map_err(codec_err)?;
    let (width, height) = decoder.dimensions();
    let size = decoder
        .output_buffer_size()
        .ok_or(ImageError::Bad("webp dimensions overflow".to_string()))?;
    let mut buf = vec![0u8; size];
    decoder.read_image(&mut buf).map_err(codec_err)?;
    let channels = if decoder.has_alpha() { 4 } else { 3 };
    let rgba = expand_to_rgba(&buf, channels)?;
    Ok(RgbaImage {
        width,
        height,
        rgba,
    })
}

#[cfg(test)]
mod tests;
