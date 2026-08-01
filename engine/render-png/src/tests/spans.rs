//! RT1 rich spans on the PNG backend: a styled span actually changes
//! the painted pixels (per-run color reaches the canvas), synthetic
//! effects and decoration draw through the run path, and unknown run
//! fonts fail loudly.

use super::*;
use shojiku_image::AssetStore;
use shojiku_layout::{TextLine, TextRun};

#[test]
fn span_color_reaches_the_pixels() {
    // The same text plain vs. with a red span: the red span must paint
    // red-dominant pixels the plain render lacks.
    let template = |style: &str| {
        format!(
            r#"
page: {{ size: {{ w: 200, h: 100 }}, margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        box: {{ x: 0, y: 0, w: 200 }}
        style: {{ fontSize: 40 }}
        spans:
          - text: "あ"
          - text: "あ"
            style: {{ {style} }}
"#
        )
    };
    let plain = render(&template("fontSize: 40"), json!({}));
    let colored = render(&template("color: '#ff0000'"), json!({}));
    let (w, h, plain_px) = decode(&plain[0]);
    let (_, _, red_px) = decode(&colored[0]);
    let reds = |rgba: &[u8]| {
        (0..h)
            .flat_map(|y| (0..w).map(move |x| (x, y)))
            .filter(|&(x, y)| {
                let p = pixel(rgba, w, x, y);
                p[0] > 150 && p[1] < 100 && p[2] < 100
            })
            .count()
    };
    assert_eq!(reds(&plain_px), 0);
    assert!(reds(&red_px) > 0, "the red span painted no red pixels");
}

#[test]
fn synthetic_effects_and_decoration_draw_per_run() {
    // IPAmj has no bold/italic faces: the span takes the synthetic
    // stroke + skew + an underline rect — the run path's effect
    // branches all execute and the output still decodes. The empty
    // middle paragraph exercises the empty-run skip.
    let pages = render(
        r#"
page: { size: { w: 200, h: 100 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 200 }
        style: { fontSize: 20 }
        spans:
          - text: "計 \n\n"
          - text: "1,234"
            style: { fontFamily: ipamj-mincho, fontWeight: bold, fontStyle: italic, textDecoration: underline }
"#,
        json!({}),
    );
    let (_, _, px) = decode(&pages[0]);
    assert!(px.iter().step_by(4).any(|&r| r < 128), "nothing painted");
}

#[test]
fn unknown_run_font_is_an_error() {
    let mut doc = base_doc();
    doc.pages[0].items.push(LayoutItem::Text(TextBlock {
        font_id: fonts().default_id().to_string(),
        fallback_ids: Vec::new(),
        font_size: 10.0,
        line_height: 14.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: 1.0,
        baseline: Some(10.0),
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: vec![TextLine {
            text: "x".to_string(),
            x: 0.0,
            y: 0.0,
            width: 5.0,
            runs: vec![TextRun {
                combine: None,
                text: "x".to_string(),
                span: 0,
                link: None,
                x: 0.0,
                width: 5.0,
                font_id: "ghost".to_string(),
                fallback_ids: vec!["also-ghost".to_string()],
                font_size: 10.0,
                letter_spacing: 0.0,
                color: (0.0, 0.0, 0.0),
                synthetic_bold: false,
                synthetic_italic: false,
                decoration: None,
            }],
        }],
    }));
    assert!(matches!(
        render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions::default()),
        Err(RenderPngError::UnknownFont(id)) if id == "ghost"
    ));
}
