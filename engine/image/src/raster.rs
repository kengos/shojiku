//! Raster format sniffing and header-only dimension checks.
//!
//! The PDF backend embeds encoded bytes as-is and decodes pixels itself,
//! so this module never runs a full codec: it trusts magic bytes for the
//! format and reads dimensions from the header, which is what lets a
//! decompression bomb be rejected before any expensive work happens.

use crate::error::ImageError;

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
    let size = imagesize::blob_size(bytes)
        .map_err(|e| ImageError::Bad(format!("cannot read image dimensions: {e}")))?;
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
pub(crate) mod test_support {
    /// Builds a minimal valid PNG (fixed-color square) for tests.
    pub fn tiny_png(width: u32, height: u32) -> Vec<u8> {
        // A PNG is: signature, IHDR, IDAT (zlib'd scanlines), IEND. The
        // IDAT here uses stored (uncompressed) deflate blocks.
        let mut out = b"\x89PNG\r\n\x1a\n".to_vec();

        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&width.to_be_bytes());
        ihdr.extend_from_slice(&height.to_be_bytes());
        // 8-bit grayscale, no interlace.
        ihdr.extend_from_slice(&[8, 0, 0, 0, 0]);
        push_chunk(&mut out, b"IHDR", &ihdr);

        // Raw scanlines: each row is a filter byte + `width` gray pixels.
        let mut raw = Vec::new();
        for _ in 0..height {
            raw.push(0u8);
            raw.extend(std::iter::repeat_n(0x55u8, width as usize));
        }
        // zlib wrapper around a single stored deflate block.
        let mut idat = vec![0x78, 0x01];
        let len = raw.len() as u16;
        idat.push(0x01);
        idat.extend_from_slice(&len.to_le_bytes());
        idat.extend_from_slice(&(!len).to_le_bytes());
        idat.extend_from_slice(&raw);
        idat.extend_from_slice(&adler32(&raw).to_be_bytes());
        push_chunk(&mut out, b"IDAT", &idat);

        push_chunk(&mut out, b"IEND", &[]);
        out
    }

    fn push_chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        out.extend_from_slice(kind);
        out.extend_from_slice(data);
        let mut crc_input = kind.to_vec();
        crc_input.extend_from_slice(data);
        out.extend_from_slice(&crc32(&crc_input).to_be_bytes());
    }

    fn crc32(data: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for &byte in data {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                let mask = (crc & 1).wrapping_neg();
                crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
            }
        }
        !crc
    }

    fn adler32(data: &[u8]) -> u32 {
        let (mut a, mut b) = (1u32, 0u32);
        for &byte in data {
            a = (a + u32::from(byte)) % 65521;
            b = (b + a) % 65521;
        }
        (b << 16) | a
    }
}

#[cfg(test)]
mod tests {
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
}
