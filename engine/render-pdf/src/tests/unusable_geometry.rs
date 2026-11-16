//! Layout trees edited after layout so a part of them cannot be drawn: a
//! rect, line or SVG path whose coordinates are NaN, a fallback face id the
//! embedded fonts lack, and decoration bands that are NaN. The PDF backend
//! must write the rest of the tree and skip only the unusable part, so each
//! case is compared byte for byte with the same tree that never contained that
//! part (the writer sets no dates or ids, so equal trees give equal bytes).

use super::*;
use shojiku_image::{Asset, AssetKind, AssetStore, PathCmd, SvgPath, SvgTree};
use shojiku_layout::{
    ImageShape, LayoutDocument, LayoutItem, LayoutPage, LineShape, RectShape, TextBlock,
};

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

fn pdf_of(doc: &LayoutDocument, assets: &AssetStore) -> Vec<u8> {
    let (_pack, fonts) = shared_fonts();
    render_pdf(doc, fonts, assets).expect("render")
}

fn page_with(items: Vec<LayoutItem>) -> LayoutDocument {
    LayoutDocument {
        metadata: Default::default(),
        page_width: 100.0,
        page_height: 100.0,
        pages: vec![LayoutPage { items }],
    }
}

fn blocks(doc: &mut LayoutDocument) -> impl Iterator<Item = &mut TextBlock> {
    doc.pages[0].items.iter_mut().filter_map(|item| match item {
        LayoutItem::Text(block) => Some(block),
        _ => None,
    })
}

#[test]
fn a_rect_with_a_nan_coordinate_is_not_written() {
    let rect = |x| {
        LayoutItem::Rect(RectShape {
            x,
            y: 10.0,
            w: 30.0,
            h: 30.0,
            fill: Some((1.0, 0.0, 0.0)),
            ..Default::default()
        })
    };
    let nan = pdf_of(&page_with(vec![rect(f64::NAN)]), &AssetStore::empty());
    assert_eq!(nan, pdf_of(&page_with(vec![]), &AssetStore::empty()));
    assert_ne!(
        nan,
        pdf_of(&page_with(vec![rect(10.0)]), &AssetStore::empty()),
        "a finite rect must change the output"
    );
}

#[test]
fn a_line_with_a_nan_endpoint_is_not_written() {
    let line = |x1| {
        LayoutItem::Line(LineShape {
            x1,
            y1: 10.0,
            x2: 90.0,
            y2: 90.0,
            width: 2.0,
            color: (0.0, 0.0, 0.0),
            opacity: 1.0,
            dash: None,
        })
    };
    let nan = pdf_of(&page_with(vec![line(f64::NAN)]), &AssetStore::empty());
    assert_eq!(nan, pdf_of(&page_with(vec![]), &AssetStore::empty()));
    assert_ne!(
        nan,
        pdf_of(&page_with(vec![line(10.0)]), &AssetStore::empty()),
        "a finite line must change the output"
    );
}

#[test]
fn an_svg_path_with_a_nan_command_is_not_written() {
    let store = |cmds: Vec<PathCmd>| {
        let mut store = AssetStore::empty();
        store.insert(Asset {
            id: "svg".to_string(),
            kind: AssetKind::Svg(SvgTree {
                width: 10.0,
                height: 10.0,
                paths: vec![SvgPath {
                    cmds,
                    fill: None,
                    stroke: Some((0.0, 0.0, 0.0)),
                    stroke_width: 1.0,
                }],
                warnings: Vec::new(),
            }),
        });
        store
    };
    let image = || {
        page_with(vec![LayoutItem::Image(ImageShape {
            asset_id: "svg".to_string(),
            opacity: 1.0,
            link: None,
            x: 10.0,
            y: 10.0,
            w: 50.0,
            h: 50.0,
        })])
    };
    let line = |x: f64| vec![PathCmd::MoveTo(x, 0.0), PathCmd::LineTo(10.0, 10.0)];
    let nan = pdf_of(&image(), &store(line(f64::NAN)));
    assert_eq!(nan, pdf_of(&image(), &store(vec![])));
    assert_ne!(
        nan,
        pdf_of(&image(), &store(line(0.0))),
        "a finite path must change the output"
    );
}

#[test]
fn a_fallback_id_missing_from_the_embedded_fonts_is_left_out_of_the_face_chain() {
    for template in [HORIZONTAL, VERTICAL] {
        let doc = laid_out(template);
        let expected = pdf_of(&doc, &AssetStore::empty());
        let mut edited = doc.clone();
        for block in blocks(&mut edited) {
            block.fallback_ids = vec!["no-such-face".to_string()];
        }
        assert_eq!(pdf_of(&edited, &AssetStore::empty()), expected);
    }
}

#[test]
fn a_fallback_id_missing_from_the_embedded_fonts_on_a_vertical_rich_run_is_left_out() {
    let doc = laid_out(VERTICAL_RICH);
    let expected = pdf_of(&doc, &AssetStore::empty());
    let mut edited = doc.clone();
    for block in blocks(&mut edited) {
        for run in block.lines.iter_mut().flat_map(|line| &mut line.runs) {
            run.fallback_ids = vec!["no-such-face".to_string()];
        }
    }
    assert_eq!(pdf_of(&edited, &AssetStore::empty()), expected);
}

#[test]
fn a_horizontal_decoration_with_nan_thickness_is_not_written() {
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
    let store = AssetStore::empty();
    assert_ne!(pdf_of(&doc, &store), pdf_of(&without, &store));
    assert_eq!(pdf_of(&nan, &store), pdf_of(&without, &store));
}

#[test]
fn a_vertical_decoration_with_nan_thickness_is_not_written() {
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
    let store = AssetStore::empty();
    assert_ne!(pdf_of(&doc, &store), pdf_of(&without, &store));
    assert_eq!(pdf_of(&nan, &store), pdf_of(&without, &store));
}

#[test]
fn a_vertical_rich_run_decoration_with_nan_thickness_is_not_written() {
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
    let store = AssetStore::empty();
    assert_ne!(pdf_of(&doc, &store), pdf_of(&without, &store));
    assert_eq!(pdf_of(&nan, &store), pdf_of(&without, &store));
}
