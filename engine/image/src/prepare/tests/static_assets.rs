//! Static (`src:`) assets: bundled files, confinement, caps, errors.

use super::*;

#[test]
fn loads_bundled_raster_and_svg() {
    let dir = temp_dir("bundled");
    std::fs::write(dir.join("logo.png"), tiny_png(6, 3)).expect("write png");
    std::fs::write(dir.join("logo.svg"), SVG).expect("write svg");

    let tpl = parse_template(
        r#"
sections:
  header:
    items:
      - type: image
        box: { x: 0, y: 0, w: 50, h: 50 }
        src: logo.svg
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        box: { w: 100, h: 100 }
        src: logo.png
  footer:
    items:
      - type: image
        box: { x: 0, y: 0, w: 50, h: 50 }
        src: logo.png
"#,
    )
    .expect("template");
    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), Some(&dir));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    // footer reuses the body's key — loaded once.
    assert_eq!(store.len(), 2);
    let png = store.get("src:logo.png").expect("png");
    assert!(matches!(
        &png.kind,
        AssetKind::Raster {
            format: RasterFormat::Png,
            width_px: 6,
            height_px: 3,
            ..
        }
    ));
    assert!(matches!(
        &store.get("src:logo.svg").expect("svg").kind,
        AssetKind::Svg(_)
    ));
}

#[test]
fn static_sources_cover_inline_and_remote() {
    let tpl = template_with_image(&format!("        src: \"{}\"", png_data_uri()));
    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(store.len(), 1);

    let tpl = template_with_image("        src: \"<svg viewBox='0 0 4 4'/>\"");
    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(store.len(), 1);

    let tpl = template_with_image("        src: https://example.com/logo.png");
    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert!(diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "remote_asset_unsupported"));
    assert!(store.is_empty());
}

#[test]
fn static_failures_are_errors() {
    let tpl = template_with_image("        src: \"data:image/png;base64,@@\"");
    let (_store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert!(diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "invalid_image_asset"));

    let tpl = template_with_image("        src: missing.png");
    let (_store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert!(diags.iter().any(|d| d.code == "assets_root_missing"));

    let dir = temp_dir("missing-file");
    let (_store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), Some(&dir));
    assert!(diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "invalid_image_asset"));
}

#[test]
fn traversal_attempts_are_errors() {
    let dir = temp_dir("traversal");
    for src in ["../secret.png", "/etc/passwd"] {
        let tpl = template_with_image(&format!("        src: \"{src}\""));
        let (_store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), Some(&dir));
        assert!(
            diags.iter().any(|d| d.code == "asset_traversal"),
            "src `{src}`: {diags:?}"
        );
    }
}

#[cfg(unix)]
#[test]
fn symlink_escape_is_a_traversal_error() {
    let dir = temp_dir("symlink");
    let outside = temp_dir("symlink-outside");
    std::fs::write(outside.join("secret.png"), tiny_png(1, 1)).expect("write");
    let link = dir.join("link.png");
    let _ = std::fs::remove_file(&link);
    std::os::unix::fs::symlink(outside.join("secret.png"), &link).expect("symlink");

    let tpl = template_with_image("        src: link.png");
    let (_store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), Some(&dir));
    assert!(
        diags.iter().any(|d| d.code == "asset_traversal"),
        "diagnostics: {diags:?}"
    );
}

#[test]
fn oversized_bundled_asset_is_rejected_by_metadata() {
    let dir = temp_dir("oversized");
    std::fs::write(dir.join("big.png"), tiny_png(64, 64)).expect("write");
    let policy = AssetPolicy {
        max_asset_bytes: 16,
        ..AssetPolicy::default()
    };
    let tpl = template_with_image("        src: big.png");
    let (_store, diags) = prepare_assets(&tpl, &json!({}), &policy, Some(&dir));
    assert!(diags
        .iter()
        .any(|d| d.code == "invalid_image_asset" && d.message.contains("byte cap")));
}

#[test]
fn pixel_cap_and_unrecognized_bytes_are_static_errors() {
    let dir = temp_dir("pixels");
    std::fs::write(dir.join("big.png"), tiny_png(100, 100)).expect("write");
    std::fs::write(dir.join("junk.bin"), b"\x00\x01binary").expect("write");
    let policy = AssetPolicy {
        max_pixels: 99,
        ..AssetPolicy::default()
    };
    let tpl = template_with_image("        src: big.png");
    let (_store, diags) = prepare_assets(&tpl, &json!({}), &policy, Some(&dir));
    assert!(
        diags.iter().any(|d| d.message.contains("pixel cap")),
        "diags: {diags:?}"
    );

    let tpl = template_with_image("        src: junk.bin");
    let (_store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), Some(&dir));
    assert!(diags
        .iter()
        .any(|d| d.message.contains("unrecognized image format")));
}

#[test]
fn bundled_svg_with_bad_utf8_or_bad_markup_errors() {
    let dir = temp_dir("bad-svg");
    std::fs::write(dir.join("bad-utf8.svg"), [b'<', 0xFF, 0xFE]).expect("write");
    std::fs::write(dir.join("bad.svg"), "<svg><unclosed").expect("write");

    let tpl = template_with_image("        src: bad-utf8.svg");
    let (_s, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), Some(&dir));
    assert!(diags.iter().any(|d| d.message.contains("UTF-8")));

    let tpl = template_with_image("        src: bad.svg");
    let (_s, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), Some(&dir));
    assert!(diags.iter().any(|d| d.code == "invalid_image_asset"));
}
