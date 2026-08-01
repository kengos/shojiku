//! `defaults:` end to end: the root style at the cascade root,
//! the rem root following it, and format-warning dedup across rows.

use crate::common::*;

#[test]
fn root_style_is_inherited_by_every_item() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
defaults:
  style: { fontSize: 14 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: text
        text: aaa
        style: { lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert_eq!(text_blocks(&doc.pages[0])[0].font_size, 14.0);
}

#[test]
fn rem_root_follows_the_root_style_font_size() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
defaults:
  style: { fontSize: 14 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: container
        style: { fontSize: 20 }
        box: { h: 100 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { x: 0, y: 0, w: "2rem", h: "1rem" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let rect = rect_shapes(&doc.pages[0])[0];
    // rem = the ROOT style's 14pt, not the container's 20pt and not the
    // engine default 10pt.
    assert_eq!((rect.w, rect.h), (28.0, 14.0));
}

#[test]
fn hostile_root_font_size_falls_back_to_the_engine_rem_root() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
defaults:
  style: { fontSize: -5 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { x: 0, y: 0, w: "1rem", h: "1rem" }
      - type: text
        text: aaa
"#,
        json!({}),
    );
    // The rem root degrades to 10pt; the text use site still warns.
    assert_eq!(rect_shapes(&doc.pages[0])[0].w, 10.0);
    assert!(diags.iter().any(|d| d.code == "invalid_font_size"));
}

#[test]
fn unknown_variant_in_a_table_warns_once_not_per_row() {
    let (_, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - data: { key: when, format: fancy }
            width: 200
"#,
        json!({"rows": [
            {"when": "2026-07-05"},
            {"when": "2026-07-06"},
            {"when": "2026-07-07"}
        ]}),
    );
    let hits = diags
        .iter()
        .filter(|d| d.code == "unknown_format_variant")
        .count();
    assert_eq!(hits, 1, "diagnostics: {diags:?}");
}

#[test]
fn named_format_registry_applies_through_a_placement() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
formats:
  stamp: { type: date, pattern: "yyyy.MM.dd" }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 200 }
    items:
      - type: text
        data: { key: day, format: stamp }
"#,
        json!({"day": "2026-07-05"}),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(all_text(&doc.pages[0]).contains("2026.07.05"));
}
