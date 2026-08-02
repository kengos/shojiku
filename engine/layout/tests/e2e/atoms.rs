//! Leaf-item atoms end to end (mirrors src `engine/atoms.rs`): image
//! fit and placement, rect/line sizing and color diagnostics.

mod line_style;

use crate::common::*;

#[test]
fn image_contain_letterboxes_and_stacks_in_flow() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 10, y: 100, w: 400, h: 600 }
    gap: 5
    items:
      - type: image
        box: { x: 20, w: 100, h: 50 }
        src: logo.png
      - type: text
        text: after
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let images = image_shapes(&doc.pages[0]);
    assert_eq!(images.len(), 1);
    let img = images[0];
    assert_eq!(img.asset_id, "src:logo.png");
    // 10x10 asset in a 100x50 box: scale 5 -> 50x50, centered in x.
    assert_eq!((img.w, img.h), (50.0, 50.0));
    assert_eq!(img.x, 10.0 + 20.0 + 25.0);
    assert_eq!(img.y, 100.0);
    // The atom reserves the full box height: text lands at 100+50+5.
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].lines[0].y, 155.0);
}

#[test]
fn image_stretch_fills_the_box() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: image
        id: qr
        box: { w: 30, h: 60 }
        fit: stretch
        data: { key: qr }
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let img = image_shapes(&doc.pages[0])[0];
    assert_eq!(img.asset_id, "dyn:qr");
    assert_eq!((img.x, img.y, img.w, img.h), (0.0, 0.0, 30.0, 60.0));
}

/// Renders one image and returns the single `ImageShape` inside the
/// page's one clip group (cover/none crop to the content box).
fn clipped_image(doc: &LayoutDocument) -> (&shojiku_layout::ClipShape, &ImageShape) {
    let clip = crate::clip::only_clip(&doc.pages[0]);
    let img = clip
        .items
        .iter()
        .find_map(|i| match i {
            LayoutItem::Image(s) => Some(s),
            _ => None,
        })
        .expect("image inside clip");
    (clip, img)
}

#[test]
fn image_cover_fills_the_box_and_clips_the_overflow() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: image
        box: { x: 0, y: 0, w: 100, h: 50 }
        fit: cover
        src: logo.png
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    // 10x10 asset, cover scale = max(100/10, 50/10) = 10 -> 100x100,
    // centered (y = (50-100)/2 = -25) and clipped to the 100x50 box.
    let (clip, img) = clipped_image(&doc);
    assert_eq!((clip.x, clip.y, clip.w, clip.h), (0.0, 0.0, 100.0, 50.0));
    assert_eq!((img.x, img.y, img.w, img.h), (0.0, -25.0, 100.0, 100.0));
    // The bare top-level image list is empty — it lives inside the clip.
    assert!(image_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn image_none_keeps_intrinsic_size_and_clips_only_when_oversized() {
    let assets = test_assets();
    let tmpl = |w: u32, h: u32| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: image
        box: {{ x: 0, y: 0, w: {w}, h: {h} }}
        fit: none
        src: logo.png
"#
        )
    };
    // Box larger than the 10x10 asset: intrinsic size, centered, no clip.
    let (doc, diags) = run_with_assets(&tmpl(100, 50), json!({}), Some(&assets));
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    assert!(crate::clip::clip_shapes(&doc.pages[0]).is_empty());
    let img = image_shapes(&doc.pages[0])[0];
    assert_eq!((img.x, img.y, img.w, img.h), (45.0, 20.0, 10.0, 10.0));
    // Box smaller than the asset: intrinsic size overflows, so it clips.
    let (doc, _) = run_with_assets(&tmpl(6, 6), json!({}), Some(&assets));
    let (clip, img) = clipped_image(&doc);
    assert_eq!((clip.w, clip.h), (6.0, 6.0));
    assert_eq!((img.x, img.y, img.w, img.h), (-2.0, -2.0, 10.0, 10.0));
}

#[test]
fn image_in_band_and_absolute_body_translates_by_y() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: image
        box: { x: 5, y: 30, w: 20, h: 20 }
        src: logo.png
  body:
    type: absolute
    items:
      - type: image
        box: { x: 50, y: 200, w: 40, h: 40 }
        src: logo.png
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diagnostics: {diags:?}");
    let images = image_shapes(&doc.pages[0]);
    assert_eq!(images.len(), 2);
    // Header band image comes first: its box y offsets the shape.
    assert_eq!((images[0].x, images[0].y), (5.0, 30.0));
    assert_eq!((images[1].x, images[1].y), (50.0, 200.0));
}

#[test]
fn image_without_size_or_source_warns_and_skips() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: image
        src: logo.png
      - type: image
        box: { w: 0, h: 10 }
        src: logo.png
      - type: image
        box: { w: 10, h: 10 }
"#,
        json!({}),
        Some(&assets),
    );
    // Both sized-out images warn `image_missing_size`, and each names its
    // own item — the message is parameterless, so the path is the only
    // thing that tells the two apart (and keeps `dedup` from collapsing
    // them into one unaddressable warning).
    let sized_out: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "image_missing_size")
        .map(|d| d.path.as_deref())
        .collect();
    assert_eq!(
        sized_out,
        vec![
            Some("sections.body.items[0]"),
            Some("sections.body.items[1]")
        ]
    );
    // `empty_image_item` (a distinct code) stays separate.
    assert!(diags.iter().any(|d| d.code == "empty_image_item"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn image_with_unloaded_asset_warns_and_skips() {
    let template = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: image
        box: { w: 10, h: 10 }
        src: ghost.png
"#;
    // Store present but key missing.
    let assets = test_assets();
    let (doc, diags) = run_with_assets(template, json!({}), Some(&assets));
    assert!(diags.iter().any(|d| d.code == "missing_asset"));
    assert!(doc.pages[0].items.is_empty());

    // No store at all behaves the same.
    let (_doc, diags) = run(template, json!({}));
    assert!(diags.iter().any(|d| d.code == "missing_asset"));
}

#[test]
fn rect_without_size_warns_and_is_skipped() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 100 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "rect_missing_size"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn invalid_color_warns_and_falls_back_to_black() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: x
        style: { color: "not-a-color" }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_color"));
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].color, (0.0, 0.0, 0.0));
}

mod rect_style;
