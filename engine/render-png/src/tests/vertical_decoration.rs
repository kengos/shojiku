//! Vertical decoration bands on the PNG backend: an underline paints a
//! SIDE band just right of the column's em cell, a rich run its own band
//! along its extent. Pixels, not the tree, are asserted here.

use super::vertical::ink_in;
use super::*;

#[test]
fn a_vertical_underline_inks_right_of_the_column() {
    // fontSize 24, lineHeight 1.5 (36pt band): the single column's left is
    // 200 − 36 = 164, the band's left edge 164 + 18 + 12 = 194 — ink in
    // the 194..200 strip appears only with the underline.
    let tmpl = |style_extra: &str| {
        format!(
            r#"
page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "縦書き"
        box: {{ x: 0, y: 0, w: 200, h: 200 }}
        style: {{ fontSize: 24, lineHeight: 1.5, writingMode: vertical_rl{style_extra} }}
"#
        )
    };
    let bare = render(&tmpl(""), json!({}));
    let deco = render(&tmpl(", textDecoration: underline"), json!({}));
    let (w, h, bare_px) = decode(&bare[0]);
    let (_, _, deco_px) = decode(&deco[0]);
    // Glyph anti-aliasing may graze the strip edge, so assert the DELTA:
    // the band adds substantially more ink than any bare bleed.
    let strip = |px: &[u8]| ink_in(px, w, 194, 0, w, h);
    assert!(
        strip(&deco_px) > strip(&bare_px) + 20,
        "underline band must ink the strip: {} vs {}",
        strip(&deco_px),
        strip(&bare_px)
    );
}

#[test]
fn a_vertical_rich_run_band_paints() {
    let png = render(
        r#"
page: { size: { w: 200, h: 260 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 200, h: 260 }
        style: { fontSize: 24, lineHeight: 1.5, writingMode: vertical_rl }
        spans:
          - { text: "吾輩は", style: { textDecoration: line_through } }
          - { text: "猫" }
"#,
        json!({}),
    );
    let (w, h, px) = decode(&png[0]);
    assert!(ink_in(&px, w, 0, 0, w, h) > 60, "glyphs + band must paint");
}
