//! Vertical (縦書き) text on the PNG backend: columns paint top-to-bottom
//! from the box's right edge, upright CJK and rotated Latin both reach the
//! canvas. Pixels, not the tree, are asserted here.

use super::*;
use shojiku_image::AssetStore;
use shojiku_layout::{TextBlock, TextLine};

#[test]
fn a_vertical_block_with_an_unknown_font_is_an_error() {
    let mut doc = base_doc();
    doc.pages[0].items.push(LayoutItem::Text(TextBlock {
        font_id: "ghost".to_string(),
        fallback_ids: Vec::new(),
        font_size: 10.0,
        line_height: 10.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: 1.0,
        baseline: None,
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: Some(shojiku_layout::TextOrientation::Mixed),
        text_combine: None,
        lines: vec![TextLine {
            text: "あ".to_string(),
            x: 0.0,
            y: 0.0,
            width: 10.0,
            runs: Vec::new(),
        }],
    }));
    assert!(matches!(
        render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions::default()),
        Err(RenderPngError::UnknownFont(id)) if id == "ghost"
    ));
}

/// Counts near-black (inked) pixels in a rectangular region.
pub(super) fn ink_in(rgba: &[u8], w: u32, x0: u32, y0: u32, x1: u32, y1: u32) -> usize {
    (y0..y1)
        .flat_map(|y| (x0..x1).map(move |x| (x, y)))
        .filter(|&(x, y)| {
            let p = pixel(rgba, w, x, y);
            p[0] < 80 && p[1] < 80 && p[2] < 80 && p[3] > 128
        })
        .count()
}

#[test]
fn a_vertical_column_inks_the_right_edge_top() {
    // A 200×200pt box, one short vertical column: the ink sits in the
    // top-right region (first column, top of the column), not bottom-left.
    let png = render(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "縦書き"
        box: { x: 0, y: 0, w: 200, h: 200 }
        style: { fontSize: 24, writingMode: vertical_rl }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    // Right half, top third: inked. Left half, bottom third: blank.
    let top_right = ink_in(&px, w, w / 2, 0, w, h / 3);
    let bottom_left = ink_in(&px, w, 0, 2 * h / 3, w / 2, h);
    assert!(top_right > 50, "expected ink top-right, got {top_right}");
    assert_eq!(bottom_left, 0, "bottom-left must be blank");
}

#[test]
fn rotated_latin_paints_in_a_vertical_run() {
    // Digits under `mixed` rotate and stack down a column — they must
    // still reach the canvas (the rotation transform path).
    let png = render(
        r#"
page: { size: { w: 120, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "2026"
        box: { x: 0, y: 0, w: 120, h: 200 }
        style: { fontSize: 24, writingMode: vertical_rl }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(ink_in(&px, w, 0, 0, w, h) > 40, "rotated digits must paint");
}

#[test]
fn vert_substituted_glyphs_paint() {
    // ー and the brackets draw their GSUB `vert` alternates — the
    // substituted glyph ids must have outlines and reach the canvas.
    let png = render(
        r#"
page: { size: { w: 120, h: 260 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "「コーヒー」"
        box: { x: 0, y: 0, w: 120, h: 260 }
        style: { fontSize: 24, writingMode: vertical_rl }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(
        ink_in(&px, w, 0, 0, w, h) > 40,
        "vert alternates must paint"
    );
}

#[test]
fn a_space_glyph_has_no_outline_and_is_skipped() {
    // A full-width space in a vertical column has no drawable outline; the
    // draw path skips it (the `glyph_outline` None branch) without panic,
    // and the real characters still paint.
    let png = render(
        r#"
page: { size: { w: 120, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "あ　い"
        box: { x: 0, y: 0, w: 120, h: 200 }
        style: { fontSize: 24, writingMode: vertical_rl }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(ink_in(&px, w, 0, 0, w, h) > 40, "the two kana must paint");
}

#[test]
fn upright_orientation_also_paints() {
    // `textOrientation: upright` keeps Latin upright; still inks.
    let png = render(
        r#"
page: { size: { w: 120, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "AB"
        box: { x: 0, y: 0, w: 120, h: 200 }
        style: { fontSize: 24, writingMode: vertical_rl, textOrientation: upright }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(ink_in(&px, w, 0, 0, w, h) > 20, "upright Latin must paint");
}

#[test]
fn vertical_rich_spans_paint_per_run() {
    // Per-span vertical runs (two colors/sizes + a rotated-Latin run): the
    // rich column draw path fills glyphs run by run.
    let png = render(
        r##"
page: { size: { w: 160, h: 260 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 120, h: 240 }
        style: { fontSize: 18, writingMode: vertical_rl }
        spans:
          - { text: "吾輩は", style: { color: "#1155cc", fontSize: 24 } }
          - { text: "猫2026" }
"##,
        json!({}),
    );
    // `ink_in` counts DARK pixels, so the second (default-black) run's
    // glyphs — kana plus rotated Latin — must paint; the blue first run
    // exercises the per-run color path even though it is not counted.
    let (w, h, px) = decode(&png[0]);
    assert!(ink_in(&px, w, 0, 0, w, h) > 40, "per-run glyphs must paint");
}

#[test]
fn a_combined_digit_group_paints_in_one_cell() {
    // 縦中横: the digits share one upright cell (the scale-about-pen
    // transform path); their ink must reach the canvas.
    let png = render(
        r#"
page: { size: { w: 120, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "第12話"
        box: { x: 0, y: 0, w: 120, h: 200 }
        style: { fontSize: 24, writingMode: vertical_rl, textCombineUpright: { digits: 2 } }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(ink_in(&px, w, 0, 0, w, h) > 60, "combined cell must paint");
}

#[test]
fn a_compressed_four_digit_group_paints() {
    // Four digits compress to the 1em cell (scale < 1): the scaled
    // outline path still inks.
    let png = render(
        r#"
page: { size: { w: 120, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "2026年"
        box: { x: 0, y: 0, w: 120, h: 200 }
        style: { fontSize: 24, writingMode: vertical_rl, textCombineUpright: { digits: 4 } }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(
        ink_in(&px, w, 0, 0, w, h) > 60,
        "compressed group must paint"
    );
}

#[test]
fn a_combined_span_run_paints() {
    // 縦中横 riding a rich run: the per-run options rebuild carries
    // `TextRun::combine`, so the combined (compressed) cell inks.
    let png = render(
        r#"
page: { size: { w: 120, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 120, h: 200 }
        style: { fontSize: 24, writingMode: vertical_rl }
        spans:
          - { text: "第" }
          - { text: "2026", style: { textCombineUpright: { digits: 4 } } }
          - { text: "話" }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(ink_in(&px, w, 0, 0, w, h) > 60, "combined run must paint");
}

#[test]
fn ruby_readings_paint_beside_their_base() {
    // A vertical ruby reading is a small upright column the ordinary
    // vertical draw path handles; both base and reading must ink.
    let png = render(
        r#"
page: { size: { w: 160, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "吾輩"
        box: { x: 0, y: 0, w: 120, h: 200 }
        style: { fontSize: 24, lineHeight: 2.0, writingMode: vertical_rl }
        ruby:
          - { base: 吾輩, text: わがはい }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(ink_in(&px, w, 0, 0, w, h) > 80, "base + reading must paint");
}
