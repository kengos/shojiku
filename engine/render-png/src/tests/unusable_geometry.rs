//! Layout trees edited after layout so a part of them cannot be drawn: a
//! stroke-less path, a fallback face id the font store lacks, and decoration
//! bands or glyph positions that are NaN. The PNG backend must paint the rest
//! of the tree and skip only the unusable part, so each case is compared with
//! the same tree that never contained that part.

use super::*;
use shojiku_image::AssetStore;

const HORIZONTAL: &str = r#"
page: { size: { w: 200, h: 80 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "あい"
        box: { x: 10, y: 10, w: 180 }
        style: { fontSize: 30, lineHeight: 1.2, textDecoration: underline }
"#;

const VERTICAL: &str = r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "縦書き"
        box: { x: 0, y: 0, w: 200, h: 200 }
        style: { fontSize: 24, lineHeight: 1.5, writingMode: vertical_rl, textDecoration: underline }
"#;

const VERTICAL_RICH: &str = r#"
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
"#;

fn laid_out(template_yaml: &str) -> LayoutDocument {
    let template = parse_template(template_yaml).expect("template");
    let (pack, fonts) = shared_fonts();
    let params = json!({});
    let out = layout(&LayoutInput {
        template: &template,
        params: &params,
        catalog: None,
        pack,
        fonts,
        assets: None,
    });
    assert!(!out.diagnostics.has_errors(), "{:?}", out.diagnostics);
    out.document
}

fn png_of(doc: &LayoutDocument) -> Vec<u8> {
    render_png(doc, fonts(), &AssetStore::empty(), &PngOptions::default())
        .expect("render")
        .remove(0)
}

fn blocks(doc: &mut LayoutDocument) -> impl Iterator<Item = &mut TextBlock> {
    doc.pages[0].items.iter_mut().filter_map(|item| match item {
        LayoutItem::Text(block) => Some(block),
        _ => None,
    })
}

fn blank_png(doc: &LayoutDocument) -> Vec<u8> {
    let mut blank = doc.clone();
    blank.pages[0].items.clear();
    png_of(&blank)
}

#[test]
fn a_path_with_no_stroke_or_a_zero_stroke_width_draws_only_its_fill() {
    let square = |stroke, stroke_width| {
        let mut doc = base_doc();
        doc.pages[0]
            .items
            .push(LayoutItem::Path(shojiku_layout::PathShape {
                cmds: vec![
                    PathCmd::MoveTo(10.0, 10.0),
                    PathCmd::LineTo(40.0, 10.0),
                    PathCmd::LineTo(40.0, 40.0),
                    PathCmd::LineTo(10.0, 40.0),
                    PathCmd::Close,
                ],
                stroke,
                stroke_width,
                fill: Some((1.0, 0.0, 0.0)),
                opacity: 1.0,
            }));
        png_of(&doc)
    };
    let no_stroke = square(None, 5.0);
    let zero_width = square(Some((0.0, 0.0, 0.0)), 0.0);
    assert_eq!(no_stroke, zero_width);
    let (w, _, rgba) = decode(&no_stroke);
    assert_eq!(pixel(&rgba, w, 25, 25), [255, 0, 0, 255]);
    // No stroke: a pixel just outside the fill stays the white background.
    assert_eq!(pixel(&rgba, w, 8, 25), [255, 255, 255, 255]);
}

#[test]
fn a_fallback_id_missing_from_the_font_store_is_left_out_of_the_face_chain() {
    for template in [HORIZONTAL, VERTICAL] {
        let doc = laid_out(template);
        let expected = png_of(&doc);
        assert_ne!(expected, blank_png(&doc), "the text must draw something");
        let mut edited = doc.clone();
        for block in blocks(&mut edited) {
            block.fallback_ids = vec!["no-such-face".to_string()];
        }
        assert_eq!(png_of(&edited), expected);
    }
}

#[test]
fn a_fallback_id_missing_from_the_font_store_on_a_vertical_rich_run_is_left_out() {
    let doc = laid_out(VERTICAL_RICH);
    let expected = png_of(&doc);
    let mut edited = doc.clone();
    for block in blocks(&mut edited) {
        for run in block.lines.iter_mut().flat_map(|line| &mut line.runs) {
            run.fallback_ids = vec!["no-such-face".to_string()];
        }
    }
    assert_eq!(png_of(&edited), expected);
}

#[test]
fn a_horizontal_decoration_with_nan_thickness_is_not_drawn() {
    let doc = laid_out(HORIZONTAL);
    let mut without = doc.clone();
    let mut nan = doc.clone();
    for block in blocks(&mut without) {
        block.decorations.clear();
    }
    for block in blocks(&mut nan) {
        assert!(!block.decorations.is_empty());
        block.decorations[0].thickness = f64::NAN;
    }
    assert_ne!(png_of(&doc), png_of(&without), "the underline must show");
    assert_eq!(png_of(&nan), png_of(&without));
}

#[test]
fn a_vertical_decoration_with_nan_thickness_is_not_drawn() {
    let doc = laid_out(VERTICAL);
    let mut without = doc.clone();
    let mut nan = doc.clone();
    for block in blocks(&mut without) {
        block.decorations.clear();
    }
    for block in blocks(&mut nan) {
        assert!(!block.decorations.is_empty());
        block.decorations[0].thickness = f64::NAN;
    }
    assert_ne!(png_of(&doc), png_of(&without), "the band must show");
    assert_eq!(png_of(&nan), png_of(&without));
}

#[test]
fn a_vertical_rich_run_decoration_with_nan_thickness_is_not_drawn() {
    let doc = laid_out(VERTICAL_RICH);
    let mut without = doc.clone();
    let mut nan = doc.clone();
    for block in blocks(&mut without) {
        for run in block.lines.iter_mut().flat_map(|line| &mut line.runs) {
            run.decorations.clear();
        }
    }
    for block in blocks(&mut nan) {
        let run = block
            .lines
            .iter_mut()
            .flat_map(|line| &mut line.runs)
            .find(|run| !run.decorations.is_empty())
            .expect("a decorated run");
        run.decorations[0].thickness = f64::NAN;
    }
    assert_ne!(png_of(&doc), png_of(&without), "the run band must show");
    assert_eq!(png_of(&nan), png_of(&without));
}

#[test]
fn a_vertical_column_with_a_nan_left_edge_draws_no_glyphs() {
    let mut doc = laid_out(VERTICAL);
    let blank = blank_png(&doc);
    assert_ne!(png_of(&doc), blank, "the column must draw something");
    for block in blocks(&mut doc) {
        block.decorations.clear();
        for line in &mut block.lines {
            line.x = f64::NAN;
        }
    }
    assert_eq!(png_of(&doc), blank);
}
