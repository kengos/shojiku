//! Cell-image preparation for `image` items inside `repeat`/`repeat_flow`
//! cells: static `src:` loads once (shared), a `data:` binding loads one
//! asset per element (`dyn:<array>[<i>].<key>`), all under the shared cap.

use super::super::{cell_asset_key, prepare_assets, MAX_CELL_IMAGE_ASSETS};
use super::png_data_uri;
use crate::policy::{AssetMode, AssetPolicy};
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

#[test]
fn static_src_in_a_repeat_cell_loads_once_shared() {
    let dir = super::temp_dir("repeat-static");
    std::fs::write(
        dir.join("logo.png"),
        crate::raster::test_support::tiny_png(6, 3),
    )
    .expect("write png");
    let template = repeat_template(
        "            - type: image\n              box: { w: 20, h: 20 }\n              src: logo.png\n",
    );
    let params = json!({ "rows": [{}, {}, {}] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), Some(&dir));
    assert!(diags.is_empty(), "diags: {diags:?}");
    // One shared asset regardless of element count.
    assert!(store.contains("src:logo.png"));
    assert_eq!(store.len(), 1);
}

#[test]
fn a_static_cell_src_shared_with_a_top_level_image_loads_once() {
    // The top-level image loads `src:logo.png` first; the cell image with
    // the same src finds it already stored and dedups (loads nothing new).
    let dir = super::temp_dir("repeat-dedup");
    std::fs::write(
        dir.join("logo.png"),
        crate::raster::test_support::tiny_png(6, 3),
    )
    .expect("write png");
    let template = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        box: { w: 20, h: 20 }
        src: logo.png
      - type: repeat
        data: { key: rows }
        cell:
          items:
            - type: image
              box: { w: 20, h: 20 }
              src: logo.png
"#,
    )
    .expect("template");
    let params = json!({ "rows": [{}] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), Some(&dir));
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains("src:logo.png"));
    assert_eq!(store.len(), 1);
}

#[test]
fn a_failing_static_cell_src_reports_and_loads_nothing() {
    // The bundled file is absent, so the static load fails: an error is
    // reported and nothing is stored (the load-failure branch).
    let dir = super::temp_dir("repeat-static-fail");
    let template = repeat_template(
        "            - type: image\n              box: { w: 20, h: 20 }\n              src: missing.png\n",
    );
    let (store, diags) = prepare_assets(
        &template,
        &json!({ "rows": [{}] }),
        &AssetPolicy::default(),
        Some(&dir),
    );
    assert!(store.is_empty());
    assert!(diags.iter().any(|d| d.code == "invalid_image_asset"));
}

#[test]
fn dynamic_data_in_a_repeat_cell_loads_per_element() {
    // A non-image sibling (text) shares the cell: the collector walks past
    // it (only images are gathered) and loads the image per element.
    let template = repeat_template(concat!(
        "            - type: text\n",
        "              data: { key: label }\n",
        "            - type: image\n",
        "              box: { w: 20, h: 20 }\n",
        "              data: { key: photo }\n",
    ));
    let uri = png_data_uri();
    let params = json!({ "rows": [{ "photo": uri, "label": "a" }, { "photo": png_data_uri(), "label": "b" }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains(&cell_asset_key("rows", 0, "photo")));
    assert!(store.contains(&cell_asset_key("rows", 1, "photo")));
}

#[test]
fn a_denied_cell_image_id_blocks_its_loads() {
    let template = repeat_template(
        "            - type: image\n              id: photo_img\n              box: { w: 20, h: 20 }\n              data: { key: photo }\n",
    );
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let policy = AssetPolicy {
        dynamic_deny: vec!["photo_img".to_string()],
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&template, &params, &policy, None);
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));
    assert!(!store.contains(&cell_asset_key("rows", 0, "photo")));
}

#[test]
fn a_bundled_only_policy_rejects_inline_cell_content() {
    let template = repeat_template(
        "            - type: image\n              box: { w: 20, h: 20 }\n              data: { key: photo }\n",
    );
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let policy = AssetPolicy {
        mode: AssetMode::BundledOnly,
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&template, &params, &policy, None);
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));
    assert!(!store.contains(&cell_asset_key("rows", 0, "photo")));
}

#[test]
fn a_conflicting_src_and_data_cell_image_loads_only_the_static_asset() {
    // src wins over data at layout (the conflict is a validate error), so
    // the per-element walk must not burn cap budget on assets never drawn.
    let dir = super::temp_dir("repeat-conflict");
    std::fs::write(
        dir.join("logo.png"),
        crate::raster::test_support::tiny_png(6, 3),
    )
    .expect("write png");
    let template = repeat_template(concat!(
        "            - type: image\n",
        "              box: { w: 20, h: 20 }\n",
        "              src: logo.png\n",
        "              data: { key: photo }\n",
    ));
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), Some(&dir));
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains("src:logo.png"));
    assert!(!store.contains(&cell_asset_key("rows", 0, "photo")));
    assert_eq!(store.len(), 1);
}

#[test]
fn a_missing_array_for_a_repeat_image_loads_nothing() {
    let template = repeat_template(
        "            - type: image\n              box: { w: 20, h: 20 }\n              data: { key: photo }\n",
    );
    let (store, diags) = prepare_assets(&template, &json!({}), &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.is_empty());
}

#[test]
fn a_sourceless_cell_image_loads_nothing() {
    // Neither src nor data — the exclusivity error is validate.rs's job.
    let template = repeat_template(
        "            - type: image\n              id: bare\n              box: { w: 20, h: 20 }\n",
    );
    let (store, diags) = prepare_assets(
        &template,
        &json!({ "rows": [{}] }),
        &AssetPolicy::default(),
        None,
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.is_empty());
}

#[test]
fn a_cell_image_in_a_nested_container_is_collected() {
    let template = repeat_template(concat!(
        "            - type: container\n",
        "              items:\n",
        "                - type: image\n",
        "                  box: { w: 20, h: 20 }\n",
        "                  data: { key: photo }\n",
    ));
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains(&cell_asset_key("rows", 0, "photo")));
}

#[test]
fn a_repeat_flow_card_image_is_element_scoped() {
    let template = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: repeat_flow
        data: { key: cards }
        item:
          items:
            - type: image
              box: { w: 20, h: 20 }
              data: { key: photo }
"#,
    )
    .expect("template");
    let params = json!({ "cards": [{ "photo": png_data_uri() }, { "photo": png_data_uri() }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains(&cell_asset_key("cards", 0, "photo")));
    assert!(store.contains(&cell_asset_key("cards", 1, "photo")));
}

#[test]
fn repeat_cell_images_respect_the_load_cap() {
    // A hostile over-long array is cut at the cap with one warning.
    let template = repeat_template(
        "            - type: image\n              box: { w: 20, h: 20 }\n              data: { key: photo }\n",
    );
    let rows: Vec<serde_json::Value> = (0..MAX_CELL_IMAGE_ASSETS + 5)
        .map(|_| json!({ "photo": png_data_uri() }))
        .collect();
    let params = json!({ "rows": rows });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.iter().any(|d| d.code == "cell_image_assets_capped"));
    assert!(store.contains(&cell_asset_key("rows", MAX_CELL_IMAGE_ASSETS - 1, "photo")));
    assert!(!store.contains(&cell_asset_key("rows", MAX_CELL_IMAGE_ASSETS, "photo")));
}

#[test]
fn the_cap_is_shared_across_table_and_repeat_walks() {
    // The table walk runs first and consumes most of the budget; the
    // repeat walk gets only the remainder — one counter spans both.
    let template = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: table
        data: { key: items }
        columns:
          - { data: { key: photo }, type: image }
      - type: repeat
        data: { key: rows }
        cell:
          items:
            - type: image
              box: { w: 20, h: 20 }
              data: { key: photo }
"#,
    )
    .expect("template");
    let table_rows: Vec<serde_json::Value> = (0..MAX_CELL_IMAGE_ASSETS - 2)
        .map(|_| json!({ "photo": png_data_uri() }))
        .collect();
    let repeat_rows: Vec<serde_json::Value> =
        (0..5).map(|_| json!({ "photo": png_data_uri() })).collect();
    let params = json!({ "items": table_rows, "rows": repeat_rows });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.iter().any(|d| d.code == "cell_image_assets_capped"));
    // The table loaded cap-2 assets, so the repeat fits exactly two.
    assert!(store.contains(&cell_asset_key("items", MAX_CELL_IMAGE_ASSETS - 3, "photo")));
    assert!(store.contains(&cell_asset_key("rows", 1, "photo")));
    assert!(!store.contains(&cell_asset_key("rows", 2, "photo")));
}
