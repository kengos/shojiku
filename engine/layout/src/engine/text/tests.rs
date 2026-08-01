//! Unit tests for the block-search helper: the None branches (empty
//! slice, a non-text item, a `Clip` wrapping no block) the e2e suite
//! never reaches, plus the found/recursion branches, so both the lib and
//! e2e instantiations cover every line.

use super::find_text_block;
use crate::tree::{ClipShape, LayoutItem, RectShape, TextBlock};

fn rect() -> LayoutItem {
    LayoutItem::Rect(RectShape {
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
        stroke: None,
        stroke_width: 0.0,
        fill: None,
        opacity: 1.0,
        ..Default::default()
    })
}

fn text() -> LayoutItem {
    LayoutItem::Text(TextBlock {
        font_id: "f".into(),
        fallback_ids: Vec::new(),
        font_size: 10.0,
        line_height: 12.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: 1.0,
        baseline: None,
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: Vec::new(),
    })
}

fn clip(items: Vec<LayoutItem>) -> LayoutItem {
    LayoutItem::Clip(ClipShape {
        x: 0.0,
        y: 0.0,
        w: 1.0,
        h: 1.0,
        items,
        ..Default::default()
    })
}

#[test]
fn find_text_block_is_none_without_a_block() {
    // Empty slice, a non-text item (`_` arm), and a Clip that wraps no
    // block (the recursion returns None and falls through) all yield None.
    assert!(find_text_block(&[]).is_none());
    assert!(find_text_block(&[rect()]).is_none());
    assert!(find_text_block(&[clip(vec![rect()])]).is_none());
}

#[test]
fn find_text_block_finds_a_block_directly_and_through_a_clip() {
    assert!(find_text_block(&[rect(), text()]).is_some());
    assert!(find_text_block(&[clip(vec![rect(), text()])]).is_some());
}
