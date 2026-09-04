//! Unit tests for the asset error type.

use super::*;

#[test]
fn messages_carry_context() {
    let err = ImageError::Traversal("../x".to_string());
    assert!(err.to_string().contains("../x"));

    let err = ImageError::Io {
        path: "a.png".to_string(),
        source: std::io::Error::other("gone"),
    };
    assert!(err.to_string().contains("a.png"));
    assert!(err.to_string().contains("gone"));

    let err = ImageError::TooLarge { len: 10, cap: 5 };
    assert!(err.to_string().contains("10"));

    let err = ImageError::TooManyPixels {
        width: 9,
        height: 9,
        cap: 80,
    };
    assert!(err.to_string().contains("9x9"));

    assert!(ImageError::Missing("logo.png".to_string())
        .to_string()
        .contains("logo.png"));

    assert!(ImageError::Bad("nope".to_string())
        .to_string()
        .contains("nope"));
    assert!(ImageError::Svg("bad".to_string())
        .to_string()
        .contains("bad"));
}
