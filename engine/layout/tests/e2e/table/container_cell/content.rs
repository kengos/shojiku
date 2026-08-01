//! What a container cell draws: row-scoped bindings, the cell's own
//! top-left as the coordinate origin, mixed `data:`/`cell:` columns, and
//! the item kinds a cell may host. Style layering lives in `styles`.

use super::{cell_table, codes};
use crate::common::*;

#[test]
fn cell_bindings_are_scoped_to_their_own_row() {
    let out = cell_table(
        "minHeight: 20",
        "              items:\n                - { type: text, data: { key: name } }",
        json!([{ "name": "一行目" }, { "name": "二行目" }]),
    );
    let texts: Vec<String> = text_blocks(&out.document.pages[0])
        .iter()
        .flat_map(|b| line_texts(b))
        .collect();
    assert_eq!(texts, vec!["一行目".to_string(), "二行目".to_string()]);
}

#[test]
fn cell_interpolation_reads_the_row_element() {
    let out = cell_table(
        "minHeight: 20",
        "              items:\n                - { type: text, text: \"備考: {note}\" }",
        json!([{ "note": "至急" }]),
    );
    let texts: Vec<String> = text_blocks(&out.document.pages[0])
        .iter()
        .flat_map(|b| line_texts(b))
        .collect();
    assert_eq!(texts, vec!["備考: 至急".to_string()]);
}

#[test]
fn the_cells_top_left_is_the_coordinate_origin() {
    // `cellPadding` is a text/qr/image knob: a child's `box.x`/`box.y`
    // measure from the cell's own corner, not from a padded inset.
    let out = run_full(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 700 }
    items:
      - type: table
        data: { key: rows }
        cellPadding: 12
        style: { borderWidth: 0 }
        row: { height: 50 }
        columns:
          - width: 100
            cell:
              items:
                - { type: rect, box: { x: 3, y: 4, w: 10, h: 10 }, style: { backgroundColor: "#ff0000" } }
"##,
        json!({ "rows": [{}] }),
    );
    let rects = rect_shapes(&out.document.pages[0]);
    let probe = rects.iter().find(|r| r.w == 10.0).expect("the probe rect");
    assert_eq!((probe.x, probe.y), (3.0, 4.0));
}

#[test]
fn data_and_cell_columns_coexist_in_one_table() {
    let out = run_full(
        r##"
page: { margin: 0 }
defaults: { style: { fontFamily: biz-ud-gothic, fontSize: 10 } }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 700 }
    items:
      - type: table
        data: { key: rows }
        style: { borderWidth: 0 }
        row: { minHeight: 20 }
        columns:
          - { width: 100, data: { key: name } }
          - width: 100
            cell:
              items:
                - { type: text, data: { key: note } }
"##,
        json!({ "rows": [{ "name": "品名", "note": "備考" }] }),
    );
    let texts: Vec<String> = text_blocks(&out.document.pages[0])
        .iter()
        .flat_map(|b| line_texts(b))
        .collect();
    assert!(texts.contains(&"品名".to_string()) && texts.contains(&"備考".to_string()));
}

#[test]
fn an_unsized_cell_column_takes_the_leftover_width() {
    let out = run_full(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 700 }
    items:
      - type: table
        data: { key: rows }
        style: { borderWidth: 0 }
        row: { height: 20 }
        columns:
          - { width: 100, data: { key: n } }
          - cell:
              items:
                - { type: rect, box: { w: "100%", h: 5 }, style: { backgroundColor: "#ff0000" } }
"##,
        json!({ "rows": [{ "n": 1 }] }),
    );
    let filler = rect_shapes(&out.document.pages[0])
        .into_iter()
        .find(|r| r.h == 5.0)
        .expect("the filling rect");
    // 300 region - 100 sized = 200 leftover, starting after the first column.
    assert_eq!((filler.x, filler.w), (100.0, 200.0));
}

#[test]
fn a_cell_hosts_a_per_row_image_asset() {
    use shojiku_image::cell_asset_key;
    let out = run_full_assets(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 700 }
    items:
      - type: table
        data: { key: rows }
        style: { borderWidth: 0 }
        row: { height: 40 }
        columns:
          - width: 100
            cell:
              items:
                - { type: image, data: { key: photo }, box: { w: 20, h: 20 } }
"##,
        json!({ "rows": [{ "photo": "logo.png" }] }),
        &row_image_assets(),
    );
    let shapes = image_shapes(&out.document.pages[0]);
    assert_eq!(shapes.len(), 1);
    assert_eq!(shapes[0].asset_id, cell_asset_key("rows", 0, "photo"));
}

/// One raster under the key a `cell:` image in row 0 resolves to.
fn row_image_assets() -> shojiku_image::AssetStore {
    use shojiku_image::{Asset, AssetKind, AssetStore, RasterFormat};
    let mut store = AssetStore::empty();
    store.insert(Asset {
        id: shojiku_image::cell_asset_key("rows", 0, "photo"),
        kind: AssetKind::Raster {
            format: RasterFormat::Png,
            bytes: std::sync::Arc::new(vec![0]),
            width_px: 10,
            height_px: 10,
        },
    });
    store
}

#[test]
fn a_column_binding_nothing_renders_an_empty_cell() {
    // Neither `data:` nor `cell:` is a validate error; layout still draws
    // the row rather than failing, with that column simply empty.
    let out = run_full(
        r##"
page: { margin: 0 }
defaults: { style: { fontFamily: biz-ud-gothic, fontSize: 10 } }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 700 }
    items:
      - type: table
        data: { key: rows }
        style: { borderWidth: 0 }
        row: { height: 20 }
        columns:
          - { width: 100 }
          - { width: 100, data: { key: name } }
"##,
        json!({ "rows": [{ "name": "品名" }] }),
    );
    let texts: Vec<String> = text_blocks(&out.document.pages[0])
        .iter()
        .flat_map(|b| line_texts(b))
        .collect();
    // The empty column still emits its (empty) cell, like any blank text
    // cell; the bound one is unaffected.
    assert_eq!(texts, vec![String::new(), "品名".to_string()]);
}

#[test]
fn a_bounded_table_in_a_container_renders_its_cell_columns() {
    // The bounded (non-paginating) path shares `row_atom` with the flow
    // one, so `cell:` columns must draw there too — the A3 見開き
    // side-by-side placement.
    let out = run_full(
        r##"
page: { margin: 0 }
defaults: { style: { fontFamily: biz-ud-gothic, fontSize: 10 } }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 700 }
    items:
      - type: container
        box: { direction: row, gap: 10 }
        items:
          - type: table
            data: { key: rows }
            style: { borderWidth: 0 }
            row: { minHeight: 20 }
            columns:
              - width: 120
                cell:
                  items:
                    - { type: text, data: { key: name } }
"##,
        json!({ "rows": [{ "name": "左表" }] }),
    );
    let texts: Vec<String> = text_blocks(&out.document.pages[0])
        .iter()
        .flat_map(|b| line_texts(b))
        .collect();
    assert_eq!(texts, vec!["左表".to_string()]);
    // Addressed through the container, like any bounded table's cells.
    let path = "sections.body.items[0].items[0].columns[0].cell.items[0]";
    assert!(
        out.boxes.pages[0].iter().any(|b| b.path == path),
        "no box at `{path}`"
    );
}

#[test]
fn a_table_inside_a_cell_warns_and_is_skipped() {
    let out = cell_table(
        "minHeight: 20",
        "              items:\n                - type: table\n                  data: { key: inner }\n                  columns:\n                    - { width: 20, data: { key: x } }",
        json!([{ "inner": [{ "x": 1 }] }]),
    );
    assert!(
        codes(&out).contains(&"table_in_cell".to_string()),
        "{:?}",
        codes(&out)
    );
}
