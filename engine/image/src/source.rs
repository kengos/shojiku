//! Classification and decoding of raw image source strings.
//!
//! A source string arrives from a template `src` or a params value. It is
//! classified *before* any policy decision so `prepare_assets` can apply
//! different rules per form (bundled selection vs. inline content vs.
//! remote URL).

use crate::error::ImageError;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use shojiku_diagnostics::Echo;

/// Where an image's bytes come from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImageSource {
    /// Relative path of an asset bundled with the template.
    Bundled(String),
    /// `data:<mime>;base64,<payload>` — content carried inline.
    DataUri(String),
    /// Inline SVG markup.
    SvgText(String),
    /// http(s) URL. Recognized so policy can reject it explicitly — the
    /// engine never fetches over the network.
    Remote(String),
}

/// Classifies a raw source string by shape.
pub fn classify(raw: &str) -> ImageSource {
    let trimmed = raw.trim();
    if trimmed.starts_with("data:") {
        ImageSource::DataUri(trimmed.to_string())
    } else if trimmed.starts_with('<') {
        ImageSource::SvgText(trimmed.to_string())
    } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        ImageSource::Remote(trimmed.to_string())
    } else {
        ImageSource::Bundled(trimmed.to_string())
    }
}

/// Decoded payload of a data URI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataUriPayload {
    /// Raster bytes (format still to be sniffed — the MIME is not trusted).
    Bytes(Vec<u8>),
    /// SVG markup (`image/svg+xml`).
    Svg(String),
}

/// Decodes a base64 `data:` URI.
///
/// `max_bytes` caps the decoded size, checked against the encoded length
/// *before* decoding so an oversized payload is rejected without
/// allocating for it.
pub fn decode_data_uri(uri: &str, max_bytes: usize) -> Result<DataUriPayload, ImageError> {
    let rest = uri
        .strip_prefix("data:")
        .ok_or_else(|| ImageError::Bad("not a data URI".to_string()))?;
    let (header, payload) = rest
        .split_once(',')
        .ok_or_else(|| ImageError::Bad("data URI has no `,` separator".to_string()))?;
    let mime = header
        .strip_suffix(";base64")
        .ok_or_else(|| ImageError::Bad("only base64 data URIs are supported".to_string()))?;
    // Every 4 base64 chars decode to at most 3 bytes.
    let worst_case = payload.len() / 4 * 3;
    if worst_case > max_bytes {
        return Err(ImageError::TooLarge {
            len: worst_case,
            cap: max_bytes,
        });
    }
    let bytes = STANDARD.decode(payload).map_err(|e| {
        ImageError::Bad(format!(
            "invalid base64 payload: {}",
            Echo::inline(&e.to_string())
        ))
    })?;
    if mime.eq_ignore_ascii_case("image/svg+xml") {
        let text = String::from_utf8(bytes)
            .map_err(|_| ImageError::Bad("svg payload is not valid UTF-8".to_string()))?;
        Ok(DataUriPayload::Svg(text))
    } else {
        Ok(DataUriPayload::Bytes(bytes))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_each_source_form() {
        assert_eq!(
            classify(" assets/logo.png "),
            ImageSource::Bundled("assets/logo.png".to_string())
        );
        assert!(matches!(
            classify("data:image/png;base64,AA=="),
            ImageSource::DataUri(_)
        ));
        assert!(matches!(
            classify("<svg viewBox='0 0 1 1'/>"),
            ImageSource::SvgText(_)
        ));
        assert!(matches!(
            classify("https://example.com/a.png"),
            ImageSource::Remote(_)
        ));
        assert!(matches!(
            classify("http://example.com/a.png"),
            ImageSource::Remote(_)
        ));
    }

    #[test]
    fn decodes_base64_bytes() {
        let uri = format!("data:image/png;base64,{}", STANDARD.encode(b"hello"));
        let payload = decode_data_uri(&uri, 1024).expect("decode");
        assert_eq!(payload, DataUriPayload::Bytes(b"hello".to_vec()));
    }

    #[test]
    fn decodes_svg_mime_as_text() {
        let uri = format!(
            "data:image/svg+xml;base64,{}",
            STANDARD.encode("<svg viewBox=\"0 0 1 1\"/>")
        );
        let payload = decode_data_uri(&uri, 1024).expect("decode");
        assert!(matches!(payload, DataUriPayload::Svg(text) if text.starts_with("<svg")));
    }

    #[test]
    fn rejects_malformed_uris() {
        assert!(matches!(
            decode_data_uri("nope", 1024),
            Err(ImageError::Bad(msg)) if msg.contains("not a data URI")
        ));
        assert!(matches!(
            decode_data_uri("data:image/png;base64", 1024),
            Err(ImageError::Bad(msg)) if msg.contains("separator")
        ));
        assert!(matches!(
            decode_data_uri("data:image/png,plain", 1024),
            Err(ImageError::Bad(msg)) if msg.contains("base64")
        ));
        assert!(matches!(
            decode_data_uri("data:image/png;base64,@@@@", 1024),
            Err(ImageError::Bad(msg)) if msg.contains("payload")
        ));
    }

    #[test]
    fn rejects_oversized_payload_before_decoding() {
        let uri = format!("data:image/png;base64,{}", STANDARD.encode([0u8; 300]));
        assert!(matches!(
            decode_data_uri(&uri, 128),
            Err(ImageError::TooLarge { cap: 128, .. })
        ));
    }

    #[test]
    fn rejects_non_utf8_svg_payload() {
        let uri = format!(
            "data:image/svg+xml;base64,{}",
            STANDARD.encode([0xFFu8, 0xFE])
        );
        assert!(matches!(
            decode_data_uri(&uri, 1024),
            Err(ImageError::Bad(msg)) if msg.contains("UTF-8")
        ));
    }
}
