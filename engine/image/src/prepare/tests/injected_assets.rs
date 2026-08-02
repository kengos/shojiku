//! The host-injected asset root (`prepare_assets_injected`): bundled bytes
//! resolve without a filesystem, with confinement/caps/keys matching the FS
//! path exactly.

use super::*;
use std::collections::BTreeMap;

fn map(entries: &[(&str, Vec<u8>)]) -> BTreeMap<String, Vec<u8>> {
    entries
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect()
}

#[test]
fn injected_bundled_raster_and_svg_load() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        box: { w: 100, h: 100 }
        src: logo.png
      - type: image
        box: { w: 50, h: 50 }
        src: art/logo.svg
"#,
    )
    .expect("template");
    let injected = map(&[
        ("logo.png", tiny_png(6, 3)),
        ("art/logo.svg", SVG.as_bytes().to_vec()),
    ]);
    let (store, diags) =
        prepare_assets_injected(&tpl, &json!({}), &AssetPolicy::default(), &injected);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(store.len(), 2);
    assert!(matches!(
        &store.get("src:logo.png").expect("png").kind,
        AssetKind::Raster {
            format: RasterFormat::Png,
            width_px: 6,
            height_px: 3,
            ..
        }
    ));
    assert!(matches!(
        &store.get("src:art/logo.svg").expect("svg").kind,
        AssetKind::Svg(_)
    ));
}

#[test]
fn a_missing_injected_bundled_asset_is_an_error() {
    let tpl = template_with_image("        src: logo.png");
    let (store, diags) =
        prepare_assets_injected(&tpl, &json!({}), &AssetPolicy::default(), &BTreeMap::new());
    assert!(diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "invalid_image_asset"));
    assert!(store.is_empty());
}

#[test]
fn an_injected_traversal_path_is_rejected() {
    let tpl = template_with_image("        src: ../secret.png");
    let injected = map(&[("secret.png", tiny_png(6, 3))]);
    let (store, diags) =
        prepare_assets_injected(&tpl, &json!({}), &AssetPolicy::default(), &injected);
    assert!(diags.iter().any(|d| d.code == "asset_traversal"));
    assert!(store.is_empty());
}

#[test]
fn an_injected_dynamic_bundled_asset_loads() {
    let tpl = template_with_image("        data: { key: pic }");
    let injected = map(&[("stamp.png", tiny_png(6, 3))]);
    let (store, diags) = prepare_assets_injected(
        &tpl,
        &json!({ "pic": "stamp.png" }),
        &AssetPolicy::default(),
        &injected,
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(store.get("dyn:pic").is_some());
}

#[test]
fn per_element_cell_images_resolve_from_the_injected_root() {
    // A repeat cell's data-bound image selects bundled paths per element:
    // each loads from the injected map under its element-scoped key,
    // exactly like the filesystem root.
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: repeat
        data: { key: rows }
        cell:
          items:
            - type: image
              box: { w: 20, h: 20 }
              data: { key: pic }
"#,
    )
    .expect("template");
    let injected = map(&[("a.png", tiny_png(6, 3)), ("b.png", tiny_png(6, 3))]);
    let params = json!({ "rows": [{ "pic": "a.png" }, { "pic": "b.png" }] });
    let (store, diags) = prepare_assets_injected(&tpl, &params, &AssetPolicy::default(), &injected);
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(store.get("dyn:rows[0].pic").is_some());
    assert!(store.get("dyn:rows[1].pic").is_some());
}

#[test]
fn an_oversized_injected_asset_trips_the_byte_cap() {
    let tpl = template_with_image("        src: big.png");
    let injected = map(&[("big.png", vec![0u8; 1000])]);
    let policy = AssetPolicy {
        max_asset_bytes: 10,
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets_injected(&tpl, &json!({}), &policy, &injected);
    assert!(diags.has_errors());
    assert!(diags.iter().any(|d| d.code == "invalid_image_asset"));
    assert!(store.is_empty());
}
