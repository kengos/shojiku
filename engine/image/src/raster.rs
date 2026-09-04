//! Raster format sniffing and header-only dimension checks.
//!
//! The PDF backend embeds encoded bytes as-is and decodes pixels itself,
//! so this module never runs a full codec: it trusts magic bytes for the
//! format and reads dimensions from the header, which is what lets a
//! decompression bomb be rejected before any expensive work happens.

use crate::error::ImageError;
use shojiku_diagnostics::Echo;

/// Raster formats the PDF backend can embed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RasterFormat {
    /// PNG (`\x89PNG`).
    Png,
    /// JPEG (`FF D8 FF`).
    Jpeg,
    /// GIF (87a/89a).
    Gif,
    /// WebP (`RIFF....WEBP`).
    Webp,
}

/// Detects the container format from magic bytes.
pub fn sniff(bytes: &[u8]) -> Option<RasterFormat> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(RasterFormat::Png)
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(RasterFormat::Jpeg)
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(RasterFormat::Gif)
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(RasterFormat::Webp)
    } else {
        None
    }
}

/// Reads dimensions from the image header (no pixel decode) and enforces
/// the pixel cap.
pub fn checked_dimensions(bytes: &[u8], max_pixels: u64) -> Result<(u64, u64), ImageError> {
    let size = imagesize::blob_size(bytes).map_err(|e| {
        ImageError::Bad(format!(
            "cannot read image dimensions: {}",
            Echo::inline(&e.to_string())
        ))
    })?;
    let (width, height) = (size.width as u64, size.height as u64);
    if width == 0 || height == 0 {
        return Err(ImageError::Bad("image has a zero dimension".to_string()));
    }
    if width.saturating_mul(height) > max_pixels {
        return Err(ImageError::TooManyPixels {
            width,
            height,
            cap: max_pixels,
        });
    }
    Ok((width, height))
}

#[cfg(test)]
pub(crate) mod test_support;

#[cfg(test)]
mod tests;
