//! Every binding carrier reaches the escape: rich spans, `qr_code`,
//! `char_grid`, `list`, a form mark's `MarkBinding`, and an `image`
//! (which also changes which ASSET id the cell asks for).

use crate::common::*;

/// A `repeat` over two elements whose cell holds `items`, with the same
/// keys present in both scopes so only the branch can satisfy a test.
fn cell(items: &str, params: Value) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: repeat
        data: {{ key: cells }}
        grid: {{ columns: 1, rows: 2 }}
        cell:
          items:
{items}
"#
        ),
        params,
    )
}

fn texts(page: &LayoutPage) -> Vec<String> {
    text_blocks(page)
        .into_iter()
        .map(|b| b.lines[0].text.clone())
        .collect()
}

#[test]
fn a_rich_span_takes_the_escape_per_fragment() {
    // The documented way to mix scopes on ONE line: interpolation has no
    // scope slot, so each span carries its own `data:`.
    let (doc, diags) = cell(
        r#"            - type: text
              box: { x: 0, y: 0, w: 300 }
              spans:
                - { data: { key: store, scope: document } }
                - { text: " / " }
                - { data: { key: code } }
              style: { fontSize: 10, lineHeight: 1.0 }"#,
        json!({
            "store": "本店",
            "cells": [{ "store": "支店A", "code": "A-1" }, { "store": "支店B", "code": "B-2" }],
        }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(texts(&doc.pages[0]), vec!["本店 / A-1", "本店 / B-2"]);
}

/// Module rects per grid row — a proxy for what each cell actually
/// encoded (a longer payload needs more modules). The `cell` fixture is
/// a 1×2 grid over a 400pt-tall region, so the row boundary is y 200.
fn qr_modules_per_cell(doc: &LayoutDocument) -> [usize; 2] {
    let mut per_cell = [0usize; 2];
    for item in &doc.pages[0].items {
        if let LayoutItem::Rect(rect) = item {
            per_cell[usize::from(rect.y >= 200.0)] += 1;
        }
    }
    per_cell
}

#[test]
fn a_qr_code_takes_the_escape() {
    // The document payload is far shorter than either element's, so the
    // module counts tell the two scopes apart instead of merely proving
    // that something was drawn.
    let params = json!({
        "url": "S",
        "cells": [
            { "url": "https://example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
            { "url": "https://example.com/b" },
        ],
    });
    let escaped = r#"            - type: qr_code
              box: { x: 0, y: 0, w: 60, h: 60 }
              data: { key: url, scope: document }"#;
    let (doc, diags) = cell(escaped, params.clone());
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let modules = qr_modules_per_cell(&doc);
    assert!(modules[0] > 0, "{modules:?}");
    assert_eq!(modules[0], modules[1], "{modules:?}");

    // The control: without the escape each cell encodes its OWN url, and
    // the differing payload lengths produce differing module counts.
    let element = r#"            - type: qr_code
              box: { x: 0, y: 0, w: 60, h: 60 }
              data: { key: url }"#;
    let (doc, _) = cell(element, params);
    let per_element = qr_modules_per_cell(&doc);
    assert_ne!(per_element[0], per_element[1], "{per_element:?}");
    assert_ne!(per_element[0], modules[0], "{per_element:?} {modules:?}");
}

#[test]
fn a_char_grid_takes_the_escape() {
    let (doc, diags) = cell(
        r#"            - type: char_grid
              box: { x: 0, y: 0 }
              grid: { charsPerLine: 4, lines: 1, cellSize: 12 }
              data: { key: title, scope: document }"#,
        json!({
            "title": "本店案内",
            "cells": [{ "title": "支店あ" }, { "title": "支店い" }],
        }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let drawn: String = text_blocks(&doc.pages[0])
        .into_iter()
        .flat_map(|b| b.lines.iter().map(|l| l.text.clone()).collect::<Vec<_>>())
        .collect();
    assert!(drawn.contains('本'), "{drawn:?}");
    assert!(!drawn.contains('支'), "{drawn:?}");
}

#[test]
fn a_list_takes_the_escape_for_its_array() {
    let (doc, diags) = cell(
        r#"            - type: list
              box: { x: 0, y: 0, w: 200, h: 40 }
              data: { key: notes, scope: document }
              text: "{label}"
              style: { fontSize: 10, lineHeight: 1.0 }"#,
        json!({
            "notes": [{ "label": "全店共通" }],
            "cells": [{ "notes": [{ "label": "あ" }] }, { "notes": [{ "label": "い" }] }],
        }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(texts(&doc.pages[0]), vec!["全店共通", "全店共通"]);
}

#[test]
fn a_form_mark_takes_the_escape() {
    // A page-global flag ticks the box in EVERY cell, even though each
    // element carries its own `false` under the same key.
    let (doc, diags) = cell(
        r#"            - type: checkbox
              box: { x: 0, y: 0, w: 10, h: 10 }
              data: { key: paid, scope: document }"#,
        json!({
            "paid": true,
            "cells": [{ "paid": false }, { "paid": false }],
        }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // Each checkbox draws a frame rect; a ticked one adds the check path.
    assert_eq!(path_shapes(&doc.pages[0]).len(), 2);
}

#[test]
fn a_document_scoped_cell_image_asks_for_the_shared_asset() {
    let mut assets = test_assets();
    assets.insert(shojiku_image::Asset {
        id: "dyn:logo".to_string(),
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
              data: { key: logo, scope: document }
"#,
        json!({ "logo": "shop.png", "cells": [{ "photo": "a.png" }, { "photo": "b.png" }] }),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let ids: Vec<&str> = image_shapes(&doc.pages[0])
        .iter()
        .map(|s| s.asset_id.as_str())
        .collect();
    // One shared id for both cells — not `dyn:cells[i].logo`.
    assert_eq!(ids, vec!["dyn:logo", "dyn:logo"]);
}

#[test]
fn a_document_scoped_image_column_asks_for_the_shared_asset() {
    // The `type: image` COLUMN path keys its asset itself, so it needs
    // the branch of its own — one shared id in every row.
    let mut assets = test_assets();
    assets.insert(shojiku_image::Asset {
        id: "dyn:stamp".to_string(),
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
      - type: table
        data: { key: cells }
        row: { height: 40 }
        columns:
          - type: image
            data: { key: stamp, scope: document }
"#,
        json!({ "stamp": "s.png", "cells": [{}, {}] }),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let ids: Vec<&str> = image_shapes(&doc.pages[0])
        .iter()
        .map(|s| s.asset_id.as_str())
        .collect();
    assert_eq!(ids, vec!["dyn:stamp", "dyn:stamp"]);
}

#[test]
fn a_plain_table_column_takes_the_escape() {
    // Not a `cell:` column — a bound column resolves its own value, so
    // it needs the branch of its own.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: table
        data: { key: cells }
        columns:
          - data: { key: store, scope: document }
          - data: { key: store }
"#,
        json!({
            "store": "本店",
            "cells": [{ "store": "支店A" }, { "store": "支店B" }],
        }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // Column 0 prints the document value in both rows; column 1 the
    // element's own.
    assert_eq!(texts(&doc.pages[0]), vec!["本店", "支店A", "本店", "支店B"]);
}
