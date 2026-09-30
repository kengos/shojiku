//! `textDecoration` on the PNG backend: the underline actually draws a
//! continuous line (spanning gaps glyphs leave), and `opacity` blends
//! toward the white background.

use super::*;

#[test]
fn underline_draws_a_continuous_row_of_ink() {
    // "あ あ" leaves a glyph-free gap at the space; the underline is the
    // only thing painting there. Compare the same document with and
    // without the decoration instead of predicting exact metrics.
    let template = |deco: &str| {
        format!(
            r#"
page: {{ size: {{ w: 200, h: 100 }}, margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "あ あ"
        box: {{ x: 0, y: 0, w: 200 }}
        style: {{ fontSize: 40, lineHeight: 1.2{deco} }}
"#
        )
    };
    let plain = render(&template(""), json!({}));
    let underlined = render(&template(", textDecoration: underline"), json!({}));
    let (w, h, plain_px) = decode(&plain[0]);
    let (_, _, under_px) = decode(&underlined[0]);
    // Some row gained a long dark run that the plain render lacks.
    let dark_run = |rgba: &[u8]| -> usize {
        let mut best = 0;
        for y in 0..h {
            let mut run = 0;
            let mut row_best = 0;
            for x in 0..w {
                let p = pixel(rgba, w, x, y);
                if p[0] < 128 {
                    run += 1;
                    row_best = row_best.max(run);
                } else {
                    run = 0;
                }
            }
            best = best.max(row_best);
        }
        best
    };
    let plain_run = dark_run(&plain_px);
    let under_run = dark_run(&under_px);
    // The underline spans both glyphs AND the space between them, so its
    // run is decisively longer than any run inside a glyph.
    assert!(
        under_run > plain_run + 20,
        "underline run {under_run} vs plain {plain_run}"
    );
}

#[test]
fn opacity_blends_fills_toward_the_background() {
    let pages = render(
        r##"
page: { size: { w: 100, h: 100 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: rect
        box: { x: 0, y: 0, w: 100, h: 50 }
        style: { backgroundColor: '#ff0000', opacity: 0.5 }
      - type: rect
        box: { x: 0, y: 50, w: 100, h: 50 }
        style: { backgroundColor: '#ff0000' }
"##,
        json!({}),
    );
    let (w, _, rgba) = decode(&pages[0]);
    let translucent = pixel(&rgba, w, w / 2, w / 4);
    let opaque = pixel(&rgba, w, w / 2, w * 3 / 4);
    // Opaque red stays red; 50% red over white gains green/blue.
    assert!(opaque[0] > 200 && opaque[1] < 60, "opaque: {opaque:?}");
    assert!(
        translucent[0] > 200 && translucent[1] > 90 && translucent[1] < 180,
        "translucent should blend toward white: {translucent:?}"
    );
}

#[test]
fn both_lines_draw_two_separate_rows_of_ink() {
    // "あ あ" again: a row whose dark run is decisively longer than anything
    // inside a glyph can only be a decoration line (it crosses the gap), so
    // counting the separate bands of such rows counts the lines drawn.
    let template = |deco: &str| {
        format!(
            r#"
page: {{ size: {{ w: 200, h: 100 }}, margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "あ あ"
        box: {{ x: 0, y: 0, w: 200 }}
        style: {{ fontSize: 40, lineHeight: 1.2{deco} }}
"#
        )
    };
    let row_runs = |deco: &str| -> Vec<usize> {
        let pages = render(&template(deco), json!({}));
        let (w, h, px) = decode(&pages[0]);
        (0..h)
            .map(|y| {
                let (mut run, mut best) = (0, 0);
                for x in 0..w {
                    run = if pixel(&px, w, x, y)[0] < 128 {
                        run + 1
                    } else {
                        0
                    };
                    best = best.max(run);
                }
                best
            })
            .collect()
    };
    let glyph_run = row_runs("").into_iter().max().unwrap_or(0);
    let bands = |deco: &str| -> usize {
        let mut bands = 0;
        let mut inside = false;
        for run in row_runs(deco) {
            let line = run > glyph_run + 20;
            if line && !inside {
                bands += 1;
            }
            inside = line;
        }
        bands
    };
    assert_eq!(bands(", textDecoration: underline"), 1);
    assert_eq!(bands(", textDecoration: underline line_through"), 2);
}

#[test]
fn both_lines_draw_two_side_bands_on_vertical_text() {
    // The vertical twin of the band count above, transposed: "あ　あ" down one
    // column leaves a glyph-free gap, so a COLUMN of pixels whose dark run is
    // decisively longer than any inside a glyph can only be a side line.
    let template = |deco: &str| {
        format!(
            r#"
page: {{ size: {{ w: 100, h: 200 }}, margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "あ　あ"
        box: {{ x: 0, y: 0, w: 100, h: 200 }}
        style: {{ fontSize: 40, lineHeight: 1.2, writingMode: vertical_rl{deco} }}
"#
        )
    };
    let col_runs = |deco: &str| -> Vec<usize> {
        let pages = render(&template(deco), json!({}));
        let (w, h, px) = decode(&pages[0]);
        (0..w)
            .map(|x| {
                let (mut run, mut best) = (0, 0);
                for y in 0..h {
                    run = if pixel(&px, w, x, y)[0] < 128 {
                        run + 1
                    } else {
                        0
                    };
                    best = best.max(run);
                }
                best
            })
            .collect()
    };
    let glyph_run = col_runs("").into_iter().max().unwrap_or(0);
    let bands = |deco: &str| -> usize {
        let mut bands = 0;
        let mut inside = false;
        for run in col_runs(deco) {
            let line = run > glyph_run + 20;
            if line && !inside {
                bands += 1;
            }
            inside = line;
        }
        bands
    };
    assert_eq!(bands(", textDecoration: underline"), 1);
    assert_eq!(bands(", textDecoration: underline line_through"), 2);
}
