//! Unit tests for the layout pipeline: the happy path (both asset sources),
//! title resolution, and the three error gates (validation / assets / layout).

use super::*;
use crate::sources::load_sources;
use crate::test_support::{ja_fonts, ja_pack, run, SIMPLE};
use shojiku_image::{AssetPolicy, AssetStore};
use std::collections::BTreeMap;

/// A valid inline SVG as bytes — the cheapest bundled asset to inject
/// (no PNG builder needed; the loader classifies leading `<` as SVG).
fn svg_bytes() -> Vec<u8> {
    br#"<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>"#.to_vec()
}

#[test]
fn lays_out_a_valid_template_with_the_default_title() {
    let prepared = run(SIMPLE, "{}").unwrap();
    assert_eq!(prepared.document.metadata.title, "Shojiku Document");
    assert!(!prepared.document.pages.is_empty());
    assert!(!prepared.diagnostics.has_errors());
}

#[test]
fn uses_the_template_name_as_title_and_accepts_prebuilt_assets() {
    let tmpl = r#"
name: Invoice
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        text: hi
"#;
    let sources = load_sources(None, tmpl, "{}").unwrap();
    let pack = ja_pack();
    let prepared = prepare(
        sources,
        PrepareCtx {
            pack: &pack,
            fonts: ja_fonts(),
            assets: AssetsInput::Prebuilt(AssetStore::empty()),
        },
    )
    .unwrap();
    assert_eq!(prepared.document.metadata.title, "Invoice");
}

#[test]
fn walks_injected_bundled_assets() {
    // The WASM path: a bundled `src:` resolves from injected bytes, no
    // filesystem. A tiny 1x1 PNG keyed by the referenced relative path.
    let tmpl = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        src: logo.svg
        box: { x: 0, y: 0, w: 50, h: 50 }
"#;
    let mut injected: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    injected.insert("logo.svg".to_string(), svg_bytes());
    let sources = load_sources(None, tmpl, "{}").unwrap();
    let pack = ja_pack();
    let prepared = prepare(
        sources,
        PrepareCtx {
            pack: &pack,
            fonts: ja_fonts(),
            assets: AssetsInput::PrepareInjected {
                policy: &AssetPolicy::default(),
                assets: &injected,
            },
        },
    )
    .unwrap();
    assert!(!prepared.diagnostics.has_errors());
    assert!(prepared.assets.get("src:logo.svg").is_some());
}

#[test]
fn gates_injected_asset_errors() {
    // A bundled `src:` with no matching injected key errors, same as the
    // filesystem missing-asset gate.
    let tmpl = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        src: logo.svg
        box: { x: 0, y: 0, w: 50, h: 50 }
"#;
    let sources = load_sources(None, tmpl, "{}").unwrap();
    let pack = ja_pack();
    let err = prepare(
        sources,
        PrepareCtx {
            pack: &pack,
            fonts: ja_fonts(),
            assets: AssetsInput::PrepareInjected {
                policy: &AssetPolicy::default(),
                assets: &BTreeMap::new(),
            },
        },
    )
    .unwrap_err();
    assert!(err.has_errors());
}

#[test]
fn gates_validation_errors() {
    // An image item with neither `src` nor `data` is an `image_source_missing`
    // validation error (needs no definitions).
    let bad = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        box: { x: 0, y: 0, w: 50, h: 50 }
"#;
    assert!(run(bad, "{}").unwrap_err().has_errors());
}

#[test]
fn gates_asset_errors() {
    // A bundled image with no assets root → an error-severity asset diag
    // (`assets_root_missing`); `run` uses `root: None`.
    let tmpl = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        src: logo.png
        box: { x: 0, y: 0, w: 50, h: 50 }
"#;
    assert!(run(tmpl, "{}").unwrap_err().has_errors());
}

#[test]
fn gates_layout_errors() {
    // Thousands of rows in a tiny region exceed the page cap — a layout-stage
    // error, not a validation one.
    let tmpl = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 40 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - data: { key: n }
            width: 100
"#;
    let rows: Vec<String> = (0..2000).map(|i| format!("{{\"n\": {i}}}")).collect();
    let params = format!("{{\"rows\": [{}]}}", rows.join(","));
    assert!(run(tmpl, &params).unwrap_err().has_errors());
}
