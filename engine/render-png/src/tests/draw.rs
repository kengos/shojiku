//! Drawing correctness: pages, rects, text pixels, images.

use super::*;

#[test]
fn renders_white_page_at_scale() {
    let pages = render_scaled(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 50 }
    items: []
"#,
        json!({}),
        PngOptions { scale: 3.0 },
    );
    assert_eq!(pages.len(), 1);
    let (w, h, rgba) = decode(&pages[0]);
    // A4-independent explicit page? No — page size comes from template
    // defaults (A4). Assert scale math instead of absolute size.
    assert_eq!(w, (595.28_f64 * 3.0).ceil() as u32);
    assert_eq!(h, (841.89_f64 * 3.0).ceil() as u32);
    // Empty page is pure white.
    assert_eq!(pixel(&rgba, w, 0, 0), [255, 255, 255, 255]);
}

#[test]
fn draws_filled_rect_in_color() {
    let pages = render_scaled(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: rect
        box: { x: 10, y: 10, w: 80, h: 40 }
        style: { borderWidth: 0, backgroundColor: "#ff0000" }
"##,
        json!({}),
        PngOptions { scale: 2.0 },
    );
    let (w, _h, rgba) = decode(&pages[0]);
    // Center of the rect (50, 30) pt -> (100, 60) px is red.
    assert_eq!(pixel(&rgba, w, 100, 60), [255, 0, 0, 255]);
}

#[test]
fn text_with_unmappable_char_routes_through_notdef() {
    // U+10FFFF has no glyph: FontFace resolves it to .notdef (gid 0)
    // with a 0.6em advance — the same fallback the PDF backend draws —
    // so rendering proceeds without panicking.
    let pages = render(
            "\nsections:\n  body:\n    type: absolute\n    items:\n      - type: text\n        box: { x: 10, y: 40, w: 400, h: 40 }\n        data: { key: t }\n        style: { fontSize: 20 }\n",
            json!({ "t": "A\u{10FFFF}B" }),
        );
    assert!(pages[0].starts_with(b"\x89PNG"));
}

#[test]
fn draws_text_pixels() {
    let pages = render(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 20, y: 40, w: 400, h: 40 }
        text: HHHH
        style: { fontSize: 30, color: "#000000" }
"##,
        json!({}),
    );
    let (w, h, rgba) = decode(&pages[0]);
    // Some dark pixels exist where the text is drawn.
    let mut dark = 0;
    for y in 0..h {
        for x in 0..w {
            let p = pixel(&rgba, w, x, y);
            if p[0] < 128 {
                dark += 1;
            }
        }
    }
    assert!(dark > 50, "expected glyph pixels, found {dark}");
}

/// Renders one line of large text with the given style fragment and
/// returns the page's decoded pixels. Uses ipamj-mincho on purpose: it
/// has no real bold/italic face, so `fontWeight`/`fontStyle` exercise the
/// synthetic emboldening/skew paths (the default biz-udp has a real bold).
fn render_styled_text(style: &str) -> (u32, u32, Vec<u8>) {
    let pages = render(
        &format!(
            r##"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        box: {{ x: 20, y: 40, w: 400, h: 60 }}
        text: HHHH
        style: {{ fontSize: 30, color: "#000000", fontFamily: ipamj-mincho{style} }}
"##
        ),
        json!({}),
    );
    decode(&pages[0])
}

fn dark_pixels(rgba: &[u8]) -> usize {
    rgba.chunks_exact(4).filter(|p| p[0] < 128).count()
}

/// Rightmost column containing a dark pixel (glyph ink).
fn rightmost_dark(w: u32, rgba: &[u8]) -> u32 {
    let mut max_x = 0;
    for (i, p) in rgba.chunks_exact(4).enumerate() {
        if p[0] < 128 {
            max_x = max_x.max(i as u32 % w);
        }
    }
    max_x
}

#[test]
fn synthetic_bold_adds_ink() {
    let (w, _, plain) = render_styled_text("");
    let (w2, _, bold) = render_styled_text(", fontWeight: bold");
    // Stroking thickens every glyph: strictly more dark pixels.
    assert!(
        dark_pixels(&bold) > dark_pixels(&plain),
        "bold must add ink: {} !> {}",
        dark_pixels(&bold),
        dark_pixels(&plain)
    );
    // Advances are unchanged: the run's right edge may grow only by the
    // stroke's half-width (sub-pixel here), never by a glyph advance.
    assert!(rightmost_dark(w2, &bold) <= rightmost_dark(w, &plain) + 2);
}

#[test]
fn synthetic_italic_leans_the_glyphs() {
    let (w, _, plain) = render_styled_text("");
    let (w2, _, italic) = render_styled_text(", fontStyle: italic");
    assert_eq!(w, w2);
    // The skew moves ink; the pages must differ, and the top of the
    // leaning glyphs pushes ink further right than the upright run.
    assert_ne!(plain, italic);
    assert!(rightmost_dark(w2, &italic) > rightmost_dark(w, &plain));
}

#[test]
fn letter_spacing_spreads_the_run() {
    let (w, _, plain) = render_styled_text("");
    let (w2, _, spaced) = render_styled_text(", letterSpacing: 6");
    assert_eq!(w, w2);
    // +6pt after each of 4 chars pushes the last glyph's ink right.
    assert!(rightmost_dark(w2, &spaced) > rightmost_dark(w, &plain));
}

#[test]
fn draws_svg_and_raster_images() {
    // A red-square SVG and a solid PNG (1x1 red) via data URI.
    let pages = render(
        &format!(
            r##"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: image
        box: {{ x: 10, y: 10, w: 40, h: 40 }}
        fit: stretch
        src: "<svg viewBox='0 0 10 10'><rect width='10' height='10' fill='#00ff00'/><path d='M 0 1 L 10 1' fill='none' stroke='#000000' stroke-width='0.5'/></svg>"
      - type: image
        box: {{ x: 60, y: 10, w: 40, h: 40 }}
        fit: stretch
        src: "data:image/png;base64,{}"
"##,
            png_1x1_red()
        ),
        json!({}),
    );
    let (w, _h, rgba) = decode(&pages[0]);
    // SVG green square center (30, 30) pt -> (60, 60) px.
    let g = pixel(&rgba, w, 60, 60);
    assert!(g[1] > 200 && g[0] < 80, "expected green svg: {g:?}");
    // Raster red square center (80, 30) pt -> (160, 60) px.
    let r = pixel(&rgba, w, 160, 60);
    assert!(r[0] > 200 && r[1] < 80, "expected red raster: {r:?}");
}

#[test]
fn multi_page_document_yields_one_png_each() {
    let rows: Vec<serde_json::Value> = (1..=60)
        .map(|i| json!({ "name": format!("row {i}") }))
        .collect();
    let pages = render(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 60, w: 500, h: 300 }
    items:
      - type: table
        data: { key: items }
        columns:
          - label: Name
            data: { key: name }
            width: 200
"#,
        json!({ "items": rows }),
    );
    let page_count = pages.len();
    assert!(page_count >= 2, "expected multiple pages, got {page_count}");
    for page in &pages {
        assert!(page.starts_with(b"\x89PNG"));
    }
}
