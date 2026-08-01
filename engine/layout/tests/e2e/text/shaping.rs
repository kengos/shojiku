//! Near-e2e for HarfBuzz shaping: shaped (kerned) widths flow through the
//! full template pipeline into the tree — `TextLine.width` and alignment
//! come from the shaped measurement, not per-char advance sums.

use crate::common::*;
use shojiku_layout::{shape_run, RunOptions};

/// Noto Sans regular (a Latin face with kern pairs), loaded as a
/// single-face store for `run_with_fonts`.
fn noto_store() -> FontStore {
    let path = repo_font_dir().join("noto-sans/NotoSans-Regular.ttf");
    let face = shojiku_layout::FontFace::load("noto-sans", &path).expect("load noto-sans");
    FontStore::from_faces(vec![face], "noto-sans").expect("noto store")
}

#[test]
fn kerned_line_width_lands_in_the_tree_narrower_than_char_advances() {
    let store = noto_store();
    let (doc, diags) = crate::common::run_with_fonts(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        text: AVAVAVAV
        style: { fontSize: 20 }
"#,
        json!({}),
        &store,
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    let face = store.get("noto-sans").unwrap();
    // The tree width IS the shaped width (the seam invariant end to end)…
    let shaped: f64 = shape_run(&[face], "AVAVAVAV", 20.0, RunOptions::spacing_only(0.0))
        .iter()
        .map(|g| g.advance)
        .sum();
    assert!((block.lines[0].width - shaped).abs() < 1e-9);
    // …and kerning made it measurably narrower than the per-char sum.
    let per_char: f64 = "AVAVAVAV".chars().map(|c| face.advance(c, 20.0)).sum();
    assert!(block.lines[0].width < per_char - 1.0);
}

#[test]
fn centering_uses_the_shaped_width() {
    let store = noto_store();
    let (doc, diags) = crate::common::run_with_fonts(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 500 }
    items:
      - type: text
        text: AVAVAVAV
        style: { fontSize: 20, textAlign: center }
"#,
        json!({}),
        &store,
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    let line = &block.lines[0];
    // Center offset computed from the SHAPED width: x = (400 - w) / 2.
    assert!((line.x - (400.0 - line.width) / 2.0).abs() < 1e-9);
}
