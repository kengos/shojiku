//! Unit tests for the two pure halves of hiding: blanking an atom, and
//! blanking whatever a paginating arm pushed into the pages.

use super::*;
use crate::boxes::{BoxRect, PlacedBox};
use crate::tree::{LayoutItem, RectShape};

fn rect() -> LayoutItem {
    LayoutItem::Rect(RectShape::default())
}

fn placed(path: &str) -> PlacedBox {
    let r = BoxRect {
        x: 1.0,
        y: 2.0,
        w: 3.0,
        h: 4.0,
    };
    PlacedBox {
        path: path.to_string(),
        id: None,
        border: r,
        content: r,
        text: None,
        hidden: false,
    }
}

#[test]
fn blank_keeps_the_reserved_height_and_drops_the_drawing() {
    let atom = Atom {
        height: 42.0,
        items: vec![rect(), rect()],
        boxes: vec![placed("items[0]")],
        rb: None,
    };
    let out = blank(atom);
    assert_eq!(out.height, 42.0, "a hidden item still reserves its box");
    assert!(out.items.is_empty(), "nothing is painted");
    assert_eq!(out.boxes.len(), 1, "the placement is still reported");
    assert!(
        out.boxes[0].hidden,
        "and is stamped so a Designer can ghost it"
    );
}

#[test]
fn blank_if_leaves_a_shown_atom_untouched() {
    let atom = Atom {
        height: 10.0,
        items: vec![rect()],
        boxes: vec![placed("items[0]")],
        rb: None,
    };
    let out = blank_if(atom, false);
    assert_eq!(out.items.len(), 1);
    assert!(!out.boxes[0].hidden);
}

#[test]
fn blank_since_strips_only_what_was_added_after_the_mark() {
    let mut pages = vec![PageBuild {
        items: vec![rect()],
        boxes: vec![placed("items[0]")],
    }];
    let mark = draw_mark(&pages);
    pages[0].items.push(rect());
    pages[0].boxes.push(placed("items[1]"));

    blank_since(&mut pages, &mark);

    assert_eq!(pages[0].items.len(), 1, "the earlier sibling still draws");
    assert!(!pages[0].boxes[0].hidden, "and is not stamped hidden");
    assert!(pages[0].boxes[1].hidden, "the hidden item's box is stamped");
}

#[test]
fn blank_since_keeps_pages_a_hidden_item_opened() {
    // A hidden PAGINATING item still reserves what it would have taken,
    // and for such an item that is measured in pages. Dropping them would
    // be `collapse:`, which this author did not ask for.
    let mut pages = vec![PageBuild::default()];
    let mark = draw_mark(&pages);
    pages[0].items.push(rect());
    pages.push(PageBuild {
        items: vec![rect()],
        boxes: vec![placed("items[0]")],
    });

    blank_since(&mut pages, &mark);

    assert_eq!(pages.len(), 2, "the second page stays");
    assert!(pages[0].items.is_empty());
    assert!(
        pages[1].items.is_empty(),
        "a page past the mark blanks whole"
    );
    assert!(pages[1].boxes[0].hidden);
}
