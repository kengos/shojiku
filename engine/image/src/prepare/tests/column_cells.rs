//! Cell-image preparation for table columns: a `data:`-bound `image`
//! inside a `cell:` column loads one asset per ROW (like a repeat cell
//! per element), and a table's `type: image` columns load wherever the
//! table sits — flow body, nested in a container, or a header/footer band.

use super::super::{cell_asset_key, prepare_assets};
use super::png_data_uri;
use crate::policy::AssetPolicy;
use serde_json::json;
use shojiku_core::{Template, parse_template};

/// A flow body holding `items_yaml` (already indented to the item level).
fn body(items_yaml: &str) -> Template {
    parse_template(&format!(
        r#"
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 700 }}
    items:
{items_yaml}
"#
    ))
    .expect("template")
}

#[test]
fn a_data_image_in_a_cell_column_loads_one_asset_per_row() {
    let template = body(
        "      - type: table\n        data: { key: rows }\n        columns:\n          - cell:\n              items:\n                - type: image\n                  box: { w: 20, h: 20 }\n                  data: { key: photo }\n",
    );
    let uri = png_data_uri();
    let params = json!({ "rows": [{ "photo": uri }, { "photo": uri }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains(&cell_asset_key("rows", 0, "photo")));
    assert!(store.contains(&cell_asset_key("rows", 1, "photo")));
    assert_eq!(store.len(), 2);
}

#[test]
fn an_image_column_loads_inside_a_container_bounded_table() {
    // A table placed in a container renders as one bounded block — its
    // `type: image` columns still bind per row, so their assets must be
    // prepared exactly as a flow table's are.
    let template = body(
        "      - type: container\n        items:\n          - type: table\n            data: { key: rows }\n            row: { height: 20 }\n            columns:\n              - { type: image, data: { key: photo }, width: 40 }\n",
    );
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(
        store.contains(&cell_asset_key("rows", 0, "photo")),
        "the bounded table's image column loaded nothing"
    );
}

#[test]
fn a_cell_image_nested_in_a_container_inside_the_cell_still_loads() {
    let template = body(
        "      - type: table\n        data: { key: rows }\n        columns:\n          - cell:\n              items:\n                - type: container\n                  items:\n                    - type: image\n                      box: { w: 20, h: 20 }\n                      data: { key: photo }\n",
    );
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let (store, _) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(store.contains(&cell_asset_key("rows", 0, "photo")));
}

#[test]
fn a_denied_cell_image_reports_and_loads_nothing() {
    let template = body(
        "      - type: table\n        data: { key: rows }\n        columns:\n          - cell:\n              items:\n                - type: image\n                  id: photo_img\n                  box: { w: 20, h: 20 }\n                  data: { key: photo }\n",
    );
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let policy = AssetPolicy {
        dynamic_deny: vec!["photo_img".to_string()],
        ..AssetPolicy::default()
    };
    let (store, diags) = prepare_assets(&template, &params, &policy, None);
    assert!(store.is_empty());
    assert!(
        diags.iter().any(|d| d.code == "dynamic_image_denied"),
        "diags: {diags:?}"
    );
}

#[test]
fn an_image_column_without_data_prepares_nothing() {
    // A column that binds nothing is a validate error; preparing assets
    // must survive it rather than reach for a key that isn't there.
    let template = body(
        "      - type: table\n        data: { key: rows }\n        columns:\n          - { type: image, width: 40 }\n",
    );
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(store.is_empty());
    assert!(diags.is_empty(), "diags: {diags:?}");
}

#[test]
fn a_cell_column_without_images_prepares_nothing() {
    let template = body(
        "      - type: table\n        data: { key: rows }\n        columns:\n          - cell:\n              items:\n                - { type: text, data: { key: note } }\n",
    );
    let params = json!({ "rows": [{ "note": "hi" }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(store.is_empty());
    assert!(diags.is_empty(), "diags: {diags:?}");
}

/// A template whose `band` (`header` / `footer`) holds `band_items`
/// (indented to the band's `items:` list level) over an empty flow body.
fn band(band: &str, band_items: &str) -> Template {
    parse_template(&format!(
        "sections:\n  {band}:\n    items:\n{band_items}  body:\n    type: flow\n    items: []\n"
    ))
    .expect("template")
}

#[test]
fn an_image_column_loads_in_a_header_or_footer_table() {
    // Layout draws a band table on every page it repeats on, so its
    // `type: image` column needs the same per-row assets a body one gets.
    let table = "      - type: table\n        data: { key: rows }\n        row: { height: 20 }\n        columns:\n          - { type: image, data: { key: photo }, width: 40 }\n";
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    for section in ["header", "footer"] {
        let template = band(section, table);
        let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
        assert!(diags.is_empty(), "{section} diags: {diags:?}");
        assert!(
            store.contains(&cell_asset_key("rows", 0, "photo")),
            "the {section} table's image column loaded nothing"
        );
    }
}

#[test]
fn a_cell_column_image_loads_in_a_band_table() {
    let template = band(
        "footer",
        "      - type: container\n        items:\n          - type: table\n            data: { key: rows }\n            columns:\n              - cell:\n                  items:\n                    - type: image\n                      box: { w: 20, h: 20 }\n                      data: { key: photo }\n",
    );
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(store.contains(&cell_asset_key("rows", 0, "photo")));
}

#[test]
fn a_repeat_left_in_a_band_loads_nothing() {
    // Layout skips a band `repeat`/`repeat_flow` (`repeat_in_band`), so
    // its cell images must not spend the shared cap the drawn cells need.
    let params = json!({ "rows": [{ "photo": png_data_uri() }] });
    for repeat in [
        "      - type: repeat\n        data: { key: rows }\n        cell:\n          items:\n            - { type: image, box: { w: 20, h: 20 }, data: { key: photo } }\n",
        "      - type: repeat_flow\n        data: { key: rows }\n        item:\n          items:\n            - { type: image, box: { w: 20, h: 20 }, data: { key: photo } }\n",
    ] {
        let template = band("header", repeat);
        let (store, diags) = prepare_assets(&template, &params, &AssetPolicy::default(), None);
        assert!(diags.is_empty(), "diags: {diags:?}");
        assert_eq!(store.len(), 0, "a band repeat loaded an asset");
    }
}
