//! Unit tests for asset preparation; shared fixtures and collection
//! tests here, loading paths in the child modules.

mod cell_assets;
mod column_cells;
mod document_scope;
mod dynamic_assets;
mod injected_assets;
mod repeat_cells;
mod static_assets;

use super::*;
use crate::policy::AssetMode;
use crate::raster::test_support::tiny_png;
use crate::raster::RasterFormat;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::json;
use shojiku_core::parse_template;
use std::path::PathBuf;

pub(super) const SVG: &str =
    r##"<svg viewBox="0 0 8 8"><rect width="8" height="8" fill="#123456"/></svg>"##;

/// Unique temp dir per test to keep parallel runs isolated.
pub(super) fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("shojiku-image-test-{}-{tag}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("mkdir");
    dir
}

pub(super) fn template_with_image(image_yaml: &str) -> Template {
    parse_template(&format!(
        r#"
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 700 }}
    items:
      - type: image
        box: {{ w: 100, h: 100 }}
{image_yaml}
"#
    ))
    .expect("template")
}

pub(super) fn png_data_uri() -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(tiny_png(4, 4)))
}

#[test]
fn asset_key_prefers_src_and_falls_back_to_data() {
    let tpl = template_with_image("        src: logo.png");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("flow") };
    let Item::Image(img) = &flow.items[0] else { panic!("image") };
    assert_eq!(asset_key(img).as_deref(), Some("src:logo.png"));

    let tpl = template_with_image("        data: { key: qr }");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("flow") };
    let Item::Image(img) = &flow.items[0] else { panic!("image") };
    assert_eq!(asset_key(img).as_deref(), Some("dyn:qr"));

    let tpl = template_with_image("        id: bare");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("flow") };
    let Item::Image(img) = &flow.items[0] else { panic!("image") };
    assert_eq!(asset_key(img), None);
}

#[test]
fn images_inside_containers_are_collected() {
    let dir = temp_dir("container");
    std::fs::write(dir.join("logo.png"), tiny_png(6, 3)).expect("write png");

    let tpl = parse_template(
        r#"
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200 }
        items:
          - type: container
            items:
              - type: image
                box: { w: 20, h: 20 }
                src: logo.png
"#,
    )
    .expect("template");
    let (store, diags) = prepare_assets(&tpl, &json!({}), &AssetPolicy::default(), Some(&dir));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(store.len(), 1);
    assert!(store.get("src:logo.png").is_some());
}
