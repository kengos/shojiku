//! Slot emission: the document-order tail every box-children walk (flex and
//! grid) shares, plus the flow body's horizontal auto-margin shift.

use shojiku_core::AlignItems;
use shojiku_layout_box::cross_offset;

use crate::boxes::{translate_boxes, translate_boxes_x, PlacedBox};
use crate::tree::LayoutItem;

use super::super::{translate, translate_x, Atom, Basis};

/// One laid-out child, in document order (paint order is preserved).
pub(in crate::engine) enum Slot {
    /// Absolutely positioned child at its resolved y offset.
    Abs(Atom, f64),
    /// Flex/grid item; its main/cross offsets are computed after the
    /// pass.
    Flex(Atom),
}

/// Emits laid-out slots in document order: absolute children at their
/// own dy, flex/grid children at their computed `(dy, dx)` (one entry
/// per `Slot::Flex`, in order). Returns the items, their placements,
/// and the lowest bottom edge. Shared by the flex and grid walks.
pub(in crate::engine) fn emit_slots(
    slots: &[Slot],
    offs: &[(f64, f64)],
) -> (Vec<LayoutItem>, Vec<PlacedBox>, f64) {
    let mut out = Vec::new();
    let mut out_boxes: Vec<PlacedBox> = Vec::new();
    let mut bottom: f64 = 0.0;
    let mut flex_i = 0;
    for slot in slots {
        let (atom, dy, dx) = match slot {
            Slot::Abs(atom, dy) => (atom, *dy, 0.0),
            Slot::Flex(atom) => {
                // `offs` was computed over these same Flex slots in
                // order, so `flex_i` is always in range.
                let (dy, dx) = offs[flex_i];
                flex_i += 1;
                (atom, dy, dx)
            }
        };
        bottom = bottom.max(dy + atom.height);
        let mut items = translate(&atom.items, dy);
        let mut boxes = translate_boxes(&atom.boxes, dy);
        if dx != 0.0 {
            items = translate_x(&items, dx);
            boxes = translate_boxes_x(&boxes, dx);
        }
        out.extend(items);
        out_boxes.extend(boxes);
    }
    (out, out_boxes, bottom)
}

/// Applies horizontal auto margins to a flow item's atom (the flow body
/// is the column-flex special case): with an authored width and `auto`
/// left/right margins, the atom shifts within the region like a flex
/// child — `{ left: auto, right: auto }` centers, a single `auto`
/// pushes to the opposite edge. No-op without auto margins or without
/// a definite width (a filling item leaves no free space).
///
/// VERTICAL auto margins are deliberately NOT handled here: this helper
/// is shared by grid cells, `char_grid` sheets, `repeat_flow` cards and
/// both text paginators, none of which want them (grid cells already
/// absorb vertical autos through `cross_offset` in the grid walk). The
/// flow body's vertical handling lives in `super::super::flow`.
pub(in crate::engine) fn h_auto_margin(atom: Atom, region: &Basis) -> Atom {
    let Some(rb) = atom.rb else { return atom };
    let Some(w) = rb.w else { return atom };
    if !(rb.margin_auto[3] || rb.margin_auto[1]) {
        return atom;
    }
    // Free space after the authored x offset, left margin (both inside
    // `rb.x`), width, and right margin.
    let free = region.w - ((rb.x - region.x) + w + rb.margin[1]);
    let dx = cross_offset(
        free,
        AlignItems::Start,
        rb.margin_auto[3],
        rb.margin_auto[1],
    );
    Atom {
        height: atom.height,
        items: translate_x(&atom.items, dx),
        boxes: translate_boxes_x(&atom.boxes, dx),
        rb: atom.rb,
    }
}
