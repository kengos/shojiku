//! Non-text columns end to end: `type: qr_code` / `type: image`
//! cells (mirrors src `engine/table/content.rs`).

use crate::common::*;

fn cell_table(
    columns: &str,
    rows: Value,
    assets: Option<&shojiku_image::AssetStore>,
) -> (LayoutDocument, Diagnostics) {
    run_with_assets(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 600 }}
    items:
      - type: table
        data: {{ key: items }}
        row: {{ height: 60 }}
        columns:
{columns}"#
        ),
        json!({ "items": rows }),
        assets,
    )
}

#[test]
fn qr_column_draws_modules_scaled_to_the_row() {
    let (doc, diags) = cell_table(
        "          - { data: { key: code }, type: qr_code, width: 80 }\n          - { data: { key: name }, width: 220 }\n",
        json!([{ "code": "TICKET-0001", "name": "a" }]),
        None,
    );
    assert!(diags.is_empty(), "{diags:?}");
    // Module rects are black fills inside the first column (x < 80),
    // within the 60pt row minus the 4pt cell padding.
    let modules: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.fill == Some((0.0, 0.0, 0.0)) && r.stroke.is_none())
        .collect();
    assert!(
        modules.len() > 10,
        "expected QR modules, got {}",
        modules.len()
    );
    for m in &modules {
        assert!(
            m.x >= 4.0 - 0.01 && m.x + m.w <= 80.0 - 4.0 + 0.01,
            "module x {}",
            m.x
        );
        assert!(
            m.y >= 4.0 - 0.01 && m.y + m.h <= 60.0 - 4.0 + 0.01,
            "module y {}",
            m.y
        );
    }
}

#[test]
fn empty_qr_content_warns_and_draws_only_the_grid() {
    let (_, diags) = cell_table(
        "          - { data: { key: code }, type: qr_code, width: 80 }\n",
        json!([{ "code": "" }]),
        None,
    );
    assert!(
        diags.iter().any(|d| d.code == "empty_qr_code_item"),
        "{diags:?}"
    );
}

#[test]
fn image_column_draws_the_per_element_asset() {
    use shojiku_image::{Asset, AssetKind, AssetStore, RasterFormat};
    let mut store = AssetStore::empty();
    for i in 0..2 {
        store.insert(Asset {
            id: shojiku_image::cell_asset_key("items", i, "photo"),
            kind: AssetKind::Raster {
                format: RasterFormat::Png,
                bytes: std::sync::Arc::new(vec![0]),
                width_px: 10,
                height_px: 10,
            },
        });
    }
    let (doc, diags) = cell_table(
        "          - { data: { key: photo }, type: image, width: 100 }\n",
        json!([{ "photo": "row0.png" }, { "photo": "row1.png" }]),
        Some(&store),
    );
    assert!(diags.is_empty(), "{diags:?}");
    let images = image_shapes(&doc.pages[0]);
    assert_eq!(images.len(), 2);
    // contain fit in a 92×52 padded cell: the 10×10 asset scales to
    // 52×52, centered in the cell.
    assert_eq!(images[0].asset_id, "dyn:items[0].photo");
    assert_eq!((images[0].w, images[0].h), (52.0, 52.0));
    assert_eq!(images[0].x, 4.0 + (92.0 - 52.0) / 2.0);
    // Row 2's image sits one 60pt row lower.
    assert_eq!(images[1].y - images[0].y, 60.0);
}

#[test]
fn image_cell_opacity_comes_from_the_column_style() {
    use shojiku_image::{Asset, AssetKind, AssetStore, RasterFormat};
    let mut store = AssetStore::empty();
    store.insert(Asset {
        id: shojiku_image::cell_asset_key("items", 0, "photo"),
        kind: AssetKind::Raster {
            format: RasterFormat::Png,
            bytes: std::sync::Arc::new(vec![0]),
            width_px: 10,
            height_px: 10,
        },
    });
    // `opacity` is non-inherited, so only the column's own style reaches
    // the cell image (a row-level opacity resets at the cell boundary).
    let (doc, diags) = cell_table(
        "          - { data: { key: photo }, type: image, width: 100,\n              style: { opacity: 0.5 } }\n",
        json!([{ "photo": "row0.png" }]),
        Some(&store),
    );
    assert!(diags.is_empty(), "{diags:?}");
    assert_eq!(image_shapes(&doc.pages[0])[0].opacity, 0.5);
}

#[test]
fn missing_cell_asset_warns_and_leaves_the_cell_empty() {
    let (doc, diags) = cell_table(
        "          - { data: { key: photo }, type: image, width: 100 }\n",
        json!([{ "photo": "nope.png" }]),
        None,
    );
    assert!(diags.iter().any(|d| d.code == "missing_asset"), "{diags:?}");
    assert!(image_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn cover_fit_clips_the_cell_image() {
    use shojiku_image::{Asset, AssetKind, AssetStore, RasterFormat};
    let mut store = AssetStore::empty();
    store.insert(Asset {
        id: shojiku_image::cell_asset_key("items", 0, "photo"),
        kind: AssetKind::Raster {
            format: RasterFormat::Png,
            bytes: std::sync::Arc::new(vec![0]),
            width_px: 10,
            height_px: 40,
        },
    });
    let (doc, _) = cell_table(
        "          - { data: { key: photo }, type: image, fit: cover, width: 100 }\n",
        json!([{ "photo": "row0.png" }]),
        Some(&store),
    );
    // The tall asset covers the wide cell and overflows: clipped, so the
    // flat helper sees no image, the clip group carries it.
    assert!(image_shapes(&doc.pages[0]).is_empty());
    let clips = crate::clip::clip_shapes(&doc.pages[0]);
    assert_eq!(clips.len(), 1);
    assert_eq!(clips[0].items.len(), 1);
}

#[test]
fn over_cap_qr_cell_content_warns_and_draws_nothing() {
    let long = "x".repeat(2000);
    let (_, diags) = cell_table(
        "          - { data: { key: code }, type: qr_code, width: 80 }\n",
        json!([{ "code": long }]),
        None,
    );
    assert!(
        diags.iter().any(|d| d.code == "qr_content_too_long"),
        "{diags:?}"
    );
}

#[test]
fn auto_height_rows_are_driven_by_text_not_media_cells() {
    // No fixed row height: the text cell measures, the qr cell scales to
    // whatever height comes out (min_h floor).
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 600 }
    items:
      - type: table
        data: { key: items }
        columns:
          - { data: { key: code }, type: qr_code, width: 80 }
          - { data: { key: name }, width: 220 }
"#,
        json!({ "items": [{ "code": "T-1", "name": "a" }] }),
        None,
    );
    // The 16pt code square is legitimately below the scannable module
    // floor — that warning is the only diagnostic.
    assert!(
        diags.iter().all(|d| d.code == "qr_module_too_small"),
        "{diags:?}"
    );
    // Modules exist and stay within the 24pt default min row height.
    let modules: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.fill == Some((0.0, 0.0, 0.0)) && r.stroke.is_none())
        .collect();
    assert!(!modules.is_empty());
    for m in &modules {
        assert!(m.y + m.h <= 24.0 + 0.01, "module y {}", m.y);
    }
}

#[test]
fn degenerate_inner_cell_draws_decoration_only() {
    // padding 4 × 2 sides > the 6pt fixed row: the inner box is
    // negative, so the qr cell draws nothing (and nothing panics).
    let (doc, _) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 600 }
    items:
      - type: table
        data: { key: items }
        row: { height: 6 }
        columns:
          - { data: { key: code }, type: qr_code, width: 80 }
"#,
        json!({ "items": [{ "code": "T-1" }] }),
        None,
    );
    let modules: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.fill == Some((0.0, 0.0, 0.0)) && r.stroke.is_none())
        .collect();
    assert!(modules.is_empty());
}
