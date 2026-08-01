//! Dynamic (params-bound `data:`) assets and policy interaction.

use super::*;

#[test]
fn dynamic_inline_content_flows_through_policy() {
    let tpl = template_with_image("        id: qr\n        data: { key: qr }");
    let params = json!({ "qr": png_data_uri() });

    // Open mode: allowed.
    let (store, diags) = prepare_assets(&tpl, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(store.contains("dyn:qr"));

    // BundledOnly without allowlist: denied.
    let policy = AssetPolicy {
        mode: AssetMode::BundledOnly,
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&tpl, &params, &policy, None);
    assert!(store.is_empty());
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));

    // BundledOnly + allowlisted item: allowed again.
    let policy = AssetPolicy {
        mode: AssetMode::BundledOnly,
        dynamic_allow: vec!["qr".to_string()],
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&tpl, &params, &policy, None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(store.contains("dyn:qr"));

    // Deny list wins even in open mode.
    let policy = AssetPolicy {
        dynamic_deny: vec!["qr".to_string()],
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&tpl, &params, &policy, None);
    assert!(store.is_empty());
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));
}

#[test]
fn dynamic_svg_text_and_bundled_selection() {
    let dir = temp_dir("dynamic-bundled");
    std::fs::write(dir.join("stamp.png"), tiny_png(2, 2)).expect("write");

    let tpl = template_with_image("        id: qr\n        data: { key: qr }");
    let (store, diags) = prepare_assets(&tpl, &json!({ "qr": SVG }), &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(matches!(
        &store.get("dyn:qr").expect("qr").kind,
        AssetKind::Svg(_)
    ));

    // Bundled selection via params works even under BundledOnly.
    let policy = AssetPolicy {
        mode: AssetMode::BundledOnly,
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&tpl, &json!({ "qr": "stamp.png" }), &policy, Some(&dir));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(store.contains("dyn:qr"));

    // Remote URLs from params are always rejected.
    let (store, diags) = prepare_assets(
        &tpl,
        &json!({ "qr": "https://evil.example/x.png" }),
        &AssetPolicy::default(),
        None,
    );
    assert!(store.is_empty());
    assert!(diags.iter().any(|d| d.code == "remote_asset_unsupported"));
}

#[test]
fn dynamic_content_problems_degrade_to_warnings() {
    let tpl = template_with_image("        id: qr\n        data: { key: qr }");

    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert!(store.is_empty());
    assert!(!diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "missing_data"));

    let (_s, diags) = prepare_assets(&tpl, &json!({ "qr": 42 }), &AssetPolicy::default(), None);
    assert!(!diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "invalid_image_data"));

    let (_s, diags) = prepare_assets(
        &tpl,
        &json!({ "qr": "data:image/png;base64,@@" }),
        &AssetPolicy::default(),
        None,
    );
    assert!(!diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "invalid_image_data"));

    // Oversized inline SVG text hits the pre-parse byte cap.
    let policy = AssetPolicy {
        max_asset_bytes: 8,
        ..AssetPolicy::default()
    };
    let (_s, diags) = prepare_assets(&tpl, &json!({ "qr": SVG }), &policy, None);
    assert!(!diags.has_errors());
    assert!(diags
        .iter()
        .any(|d| d.code == "invalid_image_data" && d.message.contains("byte cap")));

    // Dynamic bundled selection of a missing file also degrades.
    let dir = temp_dir("dyn-missing");
    let (_s, diags) = prepare_assets(
        &tpl,
        &json!({ "qr": "nope.png" }),
        &AssetPolicy::default(),
        Some(&dir),
    );
    assert!(!diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "invalid_image_data"));
}

#[test]
fn svg_warnings_surface_as_diagnostics() {
    let tpl = template_with_image("        src: \"<svg viewBox='0 0 4 4'><text>hi</text></svg>\"");
    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert_eq!(store.len(), 1);
    assert!(!diags.has_errors());
    assert!(diags
        .iter()
        .any(|d| d.code == "svg_unsupported" && d.message.contains("<text>")));
}

#[test]
fn absolute_body_and_svg_data_uris_are_supported() {
    let svg_uri = format!("data:image/svg+xml;base64,{}", STANDARD.encode(SVG));
    let tpl = parse_template(&format!(
        r#"
sections:
  body:
    type: absolute
    items:
      - type: image
        box: {{ x: 0, y: 0, w: 20, h: 20 }}
        src: "{svg_uri}"
"#
    ))
    .expect("template");
    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(store.len(), 1);
    let asset = store.get(&format!("src:{svg_uri}")).expect("asset");
    assert!(matches!(&asset.kind, AssetKind::Svg(tree) if tree.width == 8.0));
}

#[test]
fn items_without_any_source_are_skipped() {
    let tpl = template_with_image("        id: bare");
    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), None);
    assert!(store.is_empty());
    assert!(diags.is_empty());
}
