//! Error type for asset classification, resolution, and decoding.

use thiserror::Error;

/// Failures while resolving or decoding an image asset.
///
/// `prepare_assets` converts these into diagnostics (errors for template
/// assets and policy/security violations, warnings for params-supplied
/// content) so a render degrades instead of panicking on hostile input.
#[derive(Debug, Error)]
pub enum ImageError {
    /// Asset path points outside the assets root (`..`, absolute path, or
    /// a symlink escaping the root).
    #[error("asset path `{0}` escapes the assets directory")]
    Traversal(String),
    /// Filesystem failure while reading a bundled asset.
    #[error("failed to read asset `{path}`: {source}")]
    Io {
        /// Path that failed to load.
        path: String,
        /// Underlying I/O error.
        source: std::io::Error,
    },
    /// A bundled asset the template references was not among the
    /// host-injected bytes (the injected-root mirror of an I/O not-found).
    #[error("bundled asset `{0}` was not injected")]
    Missing(String),
    /// Encoded or decoded data exceeds the policy byte cap.
    #[error("image data is {len} bytes which exceeds the {cap} byte cap")]
    TooLarge {
        /// Observed (or worst-case decoded) size in bytes.
        len: usize,
        /// Policy cap in bytes.
        cap: usize,
    },
    /// Raster dimensions exceed the policy pixel cap.
    #[error("image is {width}x{height}px which exceeds the {cap} pixel cap")]
    TooManyPixels {
        /// Header width in px.
        width: u64,
        /// Header height in px.
        height: u64,
        /// Policy cap on `width * height`.
        cap: u64,
    },
    /// The data is not a supported image format.
    #[error("unsupported or malformed image data: {0}")]
    Bad(String),
    /// SVG markup was rejected by the subset parser.
    #[error("invalid svg: {0}")]
    Svg(String),
}

#[cfg(test)]
mod tests {
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
}
