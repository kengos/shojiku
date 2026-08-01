//! Imposition data handling end to end: missing/invalid data and
//! unsupported placements.

use crate::common::*;

#[test]
fn repeat_missing_data_warns_and_places_nothing() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: ghost }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "missing_data"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn repeat_non_array_data_errors_and_skips() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        cell:
          items: []
"#,
        json!({ "cells": "oops" }),
    );
    assert!(diags.iter().any(|d| d.code == "not_an_array"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn repeat_empty_array_places_nothing_without_warning() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        cell:
          items: []
"#,
        json!({ "cells": [] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn static_image_in_repeat_cell_draws_shared_asset() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 1 }
        cell:
          items:
            - type: image
              box: { w: 20, h: 20 }
              src: logo.png
            - type: text
              data: { key: label }
"#,
        json!({ "cells": [{"label": "x"}, {"label": "y"}] }),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // A static `src:` is one shared asset drawn once per element.
    let shapes = image_shapes(&doc.pages[0]);
    assert_eq!(shapes.len(), 2);
    assert!(shapes.iter().all(|s| s.asset_id == "src:logo.png"));
    // The text siblings still render.
    let text = all_text(&doc.pages[0]);
    assert!(text.contains('x') && text.contains('y'));
}

#[test]
fn dynamic_image_in_repeat_cell_is_element_scoped() {
    let mut assets = test_assets();
    // Two per-element assets keyed like the prepare walk produces.
    for i in 0..2 {
        assets.insert(shojiku_image::Asset {
            id: format!("dyn:cells[{i}].photo"),
            kind: shojiku_image::AssetKind::Raster {
                format: shojiku_image::RasterFormat::Png,
                bytes: std::sync::Arc::new(vec![0]),
                width_px: 10,
                height_px: 10,
            },
        });
    }
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 1 }
        cell:
          items:
            - type: image
              box: { w: 20, h: 20 }
              data: { key: photo }
"#,
        json!({ "cells": [{"photo": "a.png"}, {"photo": "b.png"}] }),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let shapes = image_shapes(&doc.pages[0]);
    let ids: Vec<&str> = shapes.iter().map(|s| s.asset_id.as_str()).collect();
    assert!(ids.contains(&"dyn:cells[0].photo"));
    assert!(ids.contains(&"dyn:cells[1].photo"));
}

#[test]
fn cell_image_missing_element_key_warns_and_keeps_siblings() {
    // Element 0 has no `photo` (prepare skipped it quietly), so its cell
    // warns `missing_asset` and draws no image; the text sibling and the
    // other element's image still render.
    let mut assets = test_assets();
    assets.insert(shojiku_image::Asset {
        id: "dyn:cells[1].photo".to_string(),
        kind: shojiku_image::AssetKind::Raster {
            format: shojiku_image::RasterFormat::Png,
            bytes: std::sync::Arc::new(vec![0]),
            width_px: 10,
            height_px: 10,
        },
    });
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 1 }
        cell:
          items:
            - type: image
              box: { w: 20, h: 20 }
              data: { key: photo }
              style: { opacity: 0.5 }
            - type: text
              data: { key: label }
"#,
        json!({ "cells": [{"label": "x"}, {"label": "y", "photo": "b.png"}] }),
        Some(&assets),
    );
    assert!(diags.iter().any(|d| d.code == "missing_asset"), "{diags:?}");
    let shapes = image_shapes(&doc.pages[0]);
    assert_eq!(shapes.len(), 1);
    assert_eq!(shapes[0].asset_id, "dyn:cells[1].photo");
    // The item's own style opacity reaches the scoped cell image.
    assert_eq!(shapes[0].opacity, 0.5);
    let text = all_text(&doc.pages[0]);
    assert!(text.contains('x') && text.contains('y'));
}

#[test]
fn repeat_in_container_warns_and_skips() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        items:
          - type: repeat
            data: { key: cells }
            cell:
              items:
                - type: text
                  data: { key: label }
"#,
        json!({ "cells": [{"label": "x"}] }),
    );
    assert!(diags.iter().any(|d| d.code == "repeat_in_container"));
    assert_eq!(all_text(&doc.pages[0]), "");
}

#[test]
fn repeat_in_absolute_body_warns_and_skips() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: repeat
        data: { key: cells }
        cell:
          items:
            - type: text
              data: { key: label }
"#,
        json!({ "cells": [{"label": "x"}] }),
    );
    assert!(diags.iter().any(|d| d.code == "repeat_in_absolute_body"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn repeat_in_band_warns_and_skips() {
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: repeat
        data: { key: cells }
        cell:
          items:
            - type: text
              data: { key: label }
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        text: body
"#,
        json!({ "cells": [{"label": "x"}] }),
    );
    assert!(diags.iter().any(|d| d.code == "repeat_in_band"));
}
