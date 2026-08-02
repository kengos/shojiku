//! Scoped cell assets: per-element loading, key format, policy
//! denial, and the load cap.

use super::*;
use shojiku_core::Template;

fn table_template(columns_yaml: &str) -> Template {
    parse_template(&format!(
        r#"
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 700 }}
    items:
      - type: table
        data: {{ key: items }}
        columns:
{columns_yaml}
"#
    ))
    .expect("template")
}

fn png_uri() -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(tiny_png(2, 2)))
}

#[test]
fn image_columns_load_one_asset_per_element() {
    let template =
        table_template("          - { data: { key: photo }, type: image, id: photo_col }\n");
    let params = json!({ "items": [ { "photo": png_uri() }, { "photo": png_uri() } ] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "{diags:?}");
    assert!(store.contains(&cell_asset_key("items", 0, "photo")));
    assert!(store.contains(&cell_asset_key("items", 1, "photo")));
}

#[test]
fn cell_asset_key_is_the_shared_format() {
    assert_eq!(cell_asset_key("items", 3, "photo"), "dyn:items[3].photo");
}

#[test]
fn missing_or_non_string_elements_are_skipped_quietly() {
    let template = table_template("          - { data: { key: photo }, type: image }\n");
    let params = json!({ "items": [ {}, { "photo": 5 }, { "photo": png_uri() } ] });
    let (store, _) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(!store.contains(&cell_asset_key("items", 0, "photo")));
    assert!(!store.contains(&cell_asset_key("items", 1, "photo")));
    assert!(store.contains(&cell_asset_key("items", 2, "photo")));
}

#[test]
fn denied_column_id_blocks_the_whole_column() {
    let template =
        table_template("          - { data: { key: photo }, type: image, id: photo_col }\n");
    let params = json!({ "items": [ { "photo": png_uri() } ] });
    let policy = AssetPolicy {
        dynamic_deny: vec!["photo_col".to_string()],
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&template, &params, &policy, None);
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));
    assert!(!store.contains(&cell_asset_key("items", 0, "photo")));
}

#[test]
fn bundled_only_policy_rejects_inline_cell_content() {
    let template = table_template("          - { data: { key: photo }, type: image }\n");
    let params = json!({ "items": [ { "photo": png_uri() } ] });
    let policy = AssetPolicy {
        mode: AssetMode::BundledOnly,
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&template, &params, &policy, None);
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));
    assert!(!store.contains(&cell_asset_key("items", 0, "photo")));
}

#[test]
fn cell_image_loads_cap_with_a_warning() {
    let template = table_template("          - { data: { key: photo }, type: image }\n");
    let rows: Vec<serde_json::Value> = (0..MAX_CELL_IMAGE_ASSETS + 5)
        .map(|_| json!({ "photo": png_uri() }))
        .collect();
    let params = json!({ "items": rows });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.iter().any(|d| d.code == "cell_image_assets_capped"));
    assert!(store.contains(&cell_asset_key("items", MAX_CELL_IMAGE_ASSETS - 1, "photo")));
    assert!(!store.contains(&cell_asset_key("items", MAX_CELL_IMAGE_ASSETS, "photo")));
}

#[test]
fn text_columns_load_nothing() {
    let template = table_template("          - { data: { key: photo } }\n");
    let params = json!({ "items": [ { "photo": png_uri() } ] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "{diags:?}");
    assert!(!store.contains(&cell_asset_key("items", 0, "photo")));
}

#[test]
fn duplicate_columns_share_one_asset_and_missing_arrays_skip() {
    // Two image columns over the same key: the second finds the asset
    // already loaded (dedupe). A table whose params array is missing
    // loads nothing and leaves the diagnostic to the table walk.
    let template = table_template(concat!(
        "          - { data: { key: photo }, type: image }\n",
        "          - { data: { key: photo }, type: image }\n",
    ));
    let params = json!({ "items": [ { "photo": png_uri() } ] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "{diags:?}");
    assert!(store.contains(&cell_asset_key("items", 0, "photo")));
    let (store, diags) = prepare_assets(&template, &json!({}), &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "{diags:?}");
    assert!(!store.contains(&cell_asset_key("items", 0, "photo")));
}
