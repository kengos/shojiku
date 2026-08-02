//! A cell image whose `data:` binding escapes to `scope: document` is
//! ONE shared asset for the whole grid, loaded through the shared walk
//! (`dyn:<key>`) rather than once per element — and the same split holds
//! inside a table column's `cell:`.

use super::super::{cell_asset_key, prepare_assets};
use super::png_data_uri;
use crate::policy::AssetPolicy;
use serde_json::json;
use shojiku_core::{parse_template, Template};

/// A flow body with one `repeat` whose cell holds `cell_yaml`.
fn repeat_template(cell_yaml: &str) -> Template {
    parse_template(&format!(
        r#"
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 700 }}
    items:
      - type: repeat
        data: {{ key: rows }}
        cell:
          items:
{cell_yaml}
"#
    ))
    .expect("template")
}

/// A flow body with one table whose first column is a `cell:` holding
/// `cell_yaml`.
fn cell_column_template(cell_yaml: &str) -> Template {
    parse_template(&format!(
        r#"
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 700 }}
    items:
      - type: table
        data: {{ key: rows }}
        columns:
          - cell:
              items:
{cell_yaml}
"#
    ))
    .expect("template")
}

#[test]
fn a_document_scoped_cell_image_loads_one_shared_asset() {
    let template = repeat_template(concat!(
        "            - type: image\n",
        "              box: { w: 20, h: 20 }\n",
        "              data: { key: logo, scope: document }\n",
    ));
    let params = json!({
        "logo": png_data_uri(),
        "rows": [{ "photo": "a" }, { "photo": "b" }, { "photo": "c" }],
    });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    // One asset under the shared id, regardless of element count — and
    // nothing under a per-element key.
    assert!(store.contains("dyn:logo"));
    assert!(!store.contains(&cell_asset_key("rows", 0, "logo")));
    assert_eq!(store.len(), 1);
}

#[test]
fn an_element_scoped_sibling_still_loads_per_element() {
    let template = repeat_template(concat!(
        "            - type: image\n",
        "              box: { w: 20, h: 20 }\n",
        "              data: { key: logo, scope: document }\n",
        "            - type: image\n",
        "              box: { w: 20, h: 20 }\n",
        "              data: { key: photo }\n",
    ));
    let params = json!({
        "logo": png_data_uri(),
        "rows": [{ "photo": png_data_uri() }, { "photo": png_data_uri() }],
    });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains("dyn:logo"));
    assert!(store.contains(&cell_asset_key("rows", 0, "photo")));
    assert!(store.contains(&cell_asset_key("rows", 1, "photo")));
    assert_eq!(store.len(), 3);
}

#[test]
fn a_document_scoped_image_in_a_cell_column_loads_shared() {
    let template = cell_column_template(concat!(
        "                - type: image\n",
        "                  box: { w: 20, h: 20 }\n",
        "                  data: { key: logo, scope: document }\n",
    ));
    let params = json!({ "logo": png_data_uri(), "rows": [{}, {}] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains("dyn:logo"));
    assert_eq!(store.len(), 1);
}

#[test]
fn a_static_src_in_a_cell_column_loads_too() {
    // The shared walk reaches a table column's `cell:` — before the
    // document-scope split it descended only into repeat cells, so a
    // `src:` image there never loaded its asset at all.
    let dir = super::temp_dir("cell-column-static");
    std::fs::write(
        dir.join("logo.png"),
        crate::raster::test_support::tiny_png(6, 3),
    )
    .expect("write png");
    let template = cell_column_template(concat!(
        "                - type: image\n",
        "                  box: { w: 20, h: 20 }\n",
        "                  src: logo.png\n",
    ));
    let params = json!({ "rows": [{}, {}] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), Some(&dir));
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains("src:logo.png"));
    assert_eq!(store.len(), 1);
}

#[test]
fn a_denied_id_still_blocks_a_document_scoped_cell_image() {
    let template = repeat_template(concat!(
        "            - type: image\n",
        "              id: logo_img\n",
        "              box: { w: 20, h: 20 }\n",
        "              data: { key: logo, scope: document }\n",
    ));
    let params = json!({ "logo": png_data_uri(), "rows": [{}] });
    let policy = AssetPolicy {
        dynamic_deny: vec!["logo_img".to_string()],
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&template, &params, &policy, None);
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));
    assert!(!store.contains("dyn:logo"));
}

#[test]
fn a_document_scoped_image_column_loads_one_shared_asset() {
    let template = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - type: image
            data: { key: stamp, scope: document }
"#,
    )
    .expect("template");
    let params = json!({ "stamp": png_data_uri(), "rows": [{}, {}, {}] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains("dyn:stamp"));
    assert!(!store.contains(&cell_asset_key("rows", 0, "stamp")));
    assert_eq!(store.len(), 1);
}
