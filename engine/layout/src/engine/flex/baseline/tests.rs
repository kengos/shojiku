//! Baseline derivation over hand-built atoms: the rich-block explicit
//! baseline, the plain-block ascent path, the synthesized bottom edge,
//! and the shift math.

use super::*;
use crate::font::test_support::ja_store;
use crate::tree::{RectShape, TextBlock, TextLine};

fn text_atom(y: f64, size: f64, baseline: Option<f64>) -> Atom {
    let block = TextBlock {
        font_id: "biz-udp-gothic".to_string(),
        fallback_ids: Vec::new(),
        font_size: size,
        line_height: size * 1.4,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: 1.0,
        baseline,
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: vec![TextLine {
            text: "label".to_string(),
            x: 0.0,
            y,
            width: 20.0,
            runs: Vec::new(),
        }],
    };
    Atom {
        height: y + size * 1.4,
        items: vec![LayoutItem::Text(block)],
        boxes: Vec::new(),
        rb: None,
    }
}

fn rect_atom(h: f64) -> Atom {
    Atom {
        height: h,
        items: vec![LayoutItem::Rect(RectShape {
            x: 0.0,
            y: 0.0,
            w: h,
            h,
            stroke: None,
            stroke_width: 0.0,
            fill: Some((0.0, 0.0, 0.0)),
            opacity: 1.0,
            ..Default::default()
        })],
        boxes: Vec::new(),
        rb: None,
    }
}

#[test]
fn rich_block_uses_its_explicit_baseline() {
    let atom = text_atom(2.0, 11.0, Some(9.5));
    assert_eq!(atom_baseline(&atom, ja_store()), 2.0 + 9.5);
}

#[test]
fn plain_block_uses_the_primary_ascent() {
    let atom = text_atom(3.0, 11.0, None);
    let ascent = ja_store().face(Some("biz-udp-gothic")).ascent(11.0);
    assert!(ascent > 0.0);
    assert_eq!(atom_baseline(&atom, ja_store()), 3.0 + ascent);
}

#[test]
fn no_text_synthesizes_the_bottom_edge() {
    let atom = rect_atom(11.0);
    assert_eq!(atom_baseline(&atom, ja_store()), 11.0);
}

#[test]
fn empty_lines_block_is_skipped() {
    let mut atom = text_atom(2.0, 11.0, Some(9.0));
    if let LayoutItem::Text(block) = &mut atom.items[0] {
        block.lines.clear();
    }
    atom.height = 7.0;
    assert_eq!(
        atom_baseline(&atom, ja_store()),
        7.0,
        "falls to bottom edge"
    );
}

#[test]
fn shifts_align_every_baseline_to_the_deepest() {
    let text = text_atom(0.0, 11.0, Some(12.0)); // baseline 12
    let mark = rect_atom(11.0); // synthesized baseline 11
    let shifts = baseline_shifts(&[&text, &mark], ja_store());
    assert_eq!(shifts, vec![0.0, 1.0], "mark drops 1pt onto the baseline");
}
