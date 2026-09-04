//! Unit tests for image-source classification and decoding.

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
