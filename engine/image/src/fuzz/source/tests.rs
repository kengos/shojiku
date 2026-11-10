//! Unit tests for the asset-source harness: the branch each source form
//! runs under each policy setting, and that each rule fails on a load
//! result that breaks it.

use super::*;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use std::sync::Arc;

/// A data URI carrying `bytes` under `mime`.
fn data_uri(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

#[test]
fn a_remote_url_is_refused() {
    let paths = source("\n  https://example.com/logo.png");
    assert_eq!(
        paths,
        SourcePaths {
            remote: true,
            ..SourcePaths::default()
        }
    );
}

#[test]
fn a_traversal_path_is_refused() {
    for path in ["../logo.png", "sub/../../logo.png", "/logo.png"] {
        let paths = source(&format!("\n{path}"));
        assert!(paths.traversal && !paths.bundled, "{path}: {paths:?}");
    }
}

#[test]
fn a_bundled_path_loads_exactly_the_injected_files_within_the_caps() {
    for path in ["logo.png", "./sub//mark.png", "logo.svg/", " logo.svg "] {
        assert!(source(&format!("\n{path}")).bundled, "{path}");
    }
    for path in ["missing.png", ""] {
        assert_eq!(
            source(&format!("\n{path}")),
            SourcePaths::default(),
            "{path}"
        );
    }
    let capped = SourcePaths {
        capped: true,
        ..SourcePaths::default()
    };
    assert_eq!(source("bytes=10\nlogo.png"), capped);
    assert_eq!(source("px=0\nsub/mark.png"), capped);
    assert!(
        source("px=0 bytes=x\nlogo.svg").bundled,
        "an SVG has no pixel cap"
    );
}

#[test]
fn inline_content_loads_under_open_mode_or_an_allowed_item() {
    let png = data_uri("image/png", &PNG);
    assert!(source(&format!("\n{png}")).data_raster);
    assert!(source(&format!("\n{}", data_uri("image/svg+xml", SVG.as_bytes()))).data_svg);
    assert!(source(&format!("\n{SVG}")).inline_svg);
    assert!(source(&format!("mode=bundled allow=logo\n{SVG}")).inline_svg);
    assert!(
        source(&format!("px=0\n{SVG}")).inline_svg,
        "the pixel cap does not apply to inline SVG"
    );
}

#[test]
fn inline_content_is_refused_under_bundled_mode_and_for_a_denied_item() {
    let refused = SourcePaths {
        inline_refused_by_mode: true,
        ..SourcePaths::default()
    };
    let denied = SourcePaths {
        denied_item: true,
        ..SourcePaths::default()
    };
    assert_eq!(source(&format!("mode=bundled\n{SVG}")), refused);
    assert_eq!(
        source(&format!(
            "mode=bundled allow=other\n{}",
            data_uri("image/png", &PNG)
        )),
        refused
    );
    assert_eq!(source(&format!("deny=logo\n{SVG}")), denied);
    assert_eq!(source("deny=logo\nlogo.png"), denied);
    assert!(
        source("mode=bundled\nlogo.png").bundled,
        "bundled-only mode still allows selecting a bundled asset"
    );
    assert!(
        source(&format!("mode=open color=red\n{SVG}")).inline_svg,
        "a setting the harness does not read keeps the default open mode"
    );
}

#[test]
fn an_input_without_a_newline_is_read_as_settings_and_loads_an_empty_value() {
    assert_eq!(source("logo.png"), SourcePaths::default());
}

#[test]
#[should_panic(expected = "a remote URL became an asset")]
fn a_remote_asset_fails() {
    let svg = AssetKind::Svg(crate::parse_svg(SVG, &crate::SvgLimits::default()).expect("svg"));
    check_rules("http://x", Some(&svg), &[], &AssetPolicy::default());
}

#[test]
#[should_panic(expected = "a denied item was not reported")]
fn an_unreported_denial_fails() {
    let policy = settings("deny=logo");
    check_rules("logo.png", None, &[], &policy);
}

#[test]
#[should_panic(expected = "refused inline content was not reported")]
fn unreported_refused_inline_content_fails() {
    check_rules("<svg/>", None, &[], &settings("mode=bundled"));
}

#[test]
#[should_panic(expected = "was not reported")]
fn an_unreported_traversal_fails() {
    check_bundled(
        "../x",
        None,
        &[],
        &AssetPolicy::default(),
        &mut SourcePaths::default(),
    );
}

#[test]
#[should_panic(expected = "loaded: false, expected: true")]
fn an_injected_file_that_did_not_load_fails() {
    let mut paths = SourcePaths::default();
    check_bundled("logo.png", None, &[], &AssetPolicy::default(), &mut paths);
}

#[test]
#[should_panic(expected = "a raster asset is over the byte cap")]
fn a_raster_over_the_byte_cap_fails() {
    let kind = AssetKind::Raster {
        format: crate::RasterFormat::Png,
        bytes: Arc::new(PNG.to_vec()),
        width_px: 1,
        height_px: 1,
    };
    assert_caps(&kind, "", &settings("bytes=10"));
}

#[test]
#[should_panic(expected = "a raster asset is over the pixel cap")]
fn a_raster_over_the_pixel_cap_fails() {
    let kind = AssetKind::Raster {
        format: crate::RasterFormat::Png,
        bytes: Arc::new(PNG.to_vec()),
        width_px: 1,
        height_px: 1,
    };
    assert_caps(&kind, "", &settings("px=0"));
}
