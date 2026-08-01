//! The machine-readable surfaces a GUI gates on: the `inspect`
//! envelope (engine info + tree + boxes + resolved page margins) and
//! the `capabilities` payload.

use super::*;

#[test]
fn inspects_example_layout() {
    let json = run_inspect(&example_render_args().common).expect("inspect");
    let value: serde_json::Value = serde_json::from_str(&json).expect("json");
    // The envelope: engine info for gating, the tree, and the box sidecar.
    assert!(value["document"]["pages"]
        .as_array()
        .map(|p| !p.is_empty())
        .unwrap_or(false));
    assert_eq!(
        value["engine"]["version"].as_str(),
        Some(env!("CARGO_PKG_VERSION"))
    );
    let caps = value["engine"]["capabilities"].as_array().expect("caps");
    assert!(caps.iter().any(|c| c == "inspect.boxes"));
    // Boxes parallel the document pages (the ja example has id-less items,
    // so pages exist even when empty).
    assert_eq!(
        value["boxes"]["pages"].as_array().map(Vec::len),
        value["document"]["pages"].as_array().map(Vec::len)
    );
    // PM1: the resolved margins ride the envelope for Designer guides
    // (receipt-ja authors `margin: 25`).
    assert_eq!(
        value["margin"]
            .as_array()
            .map(|m| m.iter().filter_map(|v| v.as_f64()).collect::<Vec<_>>()),
        Some(vec![25.0; 4])
    );
    assert!(json.contains("領　収　書"));
}

#[test]
fn capabilities_payload_is_versioned_json() {
    let json = crate::run_capabilities().expect("capabilities");
    let value: serde_json::Value = serde_json::from_str(&json).expect("json");
    assert_eq!(value["version"].as_str(), Some(env!("CARGO_PKG_VERSION")));
    let caps = value["capabilities"].as_array().expect("caps");
    for expected in [
        "box.margin",
        "box.padding",
        "repeat",
        "render.pdf",
        "page.margin",
        "flow.box.optional",
        "table.column.width.length",
        "table.keepTogether",
        // Asset-surface widenings gate too: a pre-gradient engine leaves
        // gradient SVG fills unpainted, so the GUI must be able to tell.
        "image.svg.gradient",
        // LB1: builtin locale packs + 和暦 era formatting.
        "locale.builtin",
        "format.wareki",
        // per-side borders, spanning, non-text columns.
        "style.border.sides",
        "grid.span",
        "table.headerGroups",
        "table.column.type",
        // Cell images, image opacity, the definitions image field type.
        "image.cells",
        "image.opacity",
        "definitions.field.image",
    ] {
        assert!(caps.iter().any(|c| c == expected), "missing {expected}");
    }
    // The builtin locale list rides the same envelope for GUI pickers.
    let locales = value["builtinLocales"].as_array().expect("builtinLocales");
    assert!(locales.iter().any(|l| l == "ja-JP"));
    assert!(locales.iter().any(|l| l == "en-US"));
}
