//! Id-addressable resolved boxes: the GUI-facing sidecar the layout pass
//! emits alongside the renderer tree.
//!
//! The tree (`crate::tree`) is flattened draw primitives with no link
//! back to template items; the Designer needs per-item resolved geometry
//! to draw selection and margin/padding overlays without reimplementing
//! resolution. EVERY laid-out item gets one [`PlacedBox`] per placement
//! (a `repeat` cell child appears once per element; band items once per
//! page), addressed by a structural `path` in the validate-diagnostic
//! grammar — id-carrying or not, so the canvas can hit-test every item.
//! Renderers never read this — it is not part of the layout↔renderer
//! contract.

mod text;

pub use text::{ColumnMetric, LineMetric, TextMetrics};

use serde::Serialize;

/// A rectangle in absolute page coordinates (pt, top-left origin).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct BoxRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// One placement of a laid-out item: its structural address, border box
/// and content box (border minus padding — equal when the item has no
/// padding), plus per-line text metrics for text items (so the Designer
/// can snap overlays to the glyph band without re-measuring).
#[derive(Debug, Clone, Serialize)]
pub struct PlacedBox {
    /// Structural address of the source item in the validate-diagnostic
    /// path grammar (`sections.body.items[3].items[0]`, `…cell.items[1]`,
    /// `…columns[2]`). ALWAYS present — the GUI's primary key for
    /// correlating canvas geometry back to a YAML node. A single item
    /// produces one box per placement (per page, per repeat element), all
    /// sharing this path; the path is synthesized from structure only,
    /// never from authored ids or data keys.
    pub path: String,
    /// The item's authored `id:`, when it has one — a lookup alias; the
    /// `path` addresses every item, id-carrying or not.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub border: BoxRect,
    pub content: BoxRect,
    /// Present on text items: the baseline and cap/em band of each drawn
    /// line, in the same coordinates as `border`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<TextMetrics>,
    /// The box is reserved and the DOCUMENT decided nothing would paint
    /// there. Exactly two causes stamp it, and it is an enumeration
    /// rather than a predicate:
    ///
    /// 1. the item's `visible:` predicate did not hold (the
    ///    `visibility: hidden` default);
    /// 2. the box belongs to a `header.visuallyHidden` table header —
    ///    whose labels ARE emitted, at `opacity: 0`, to stay extractable,
    ///    while its band decoration and grid ruling are suppressed.
    ///
    /// Two things that also reserve a box without painting are NOT
    /// stamped, for different reasons. An authored `opacity: 0` style is
    /// the author's own paint choice rather than structure. An unmatched
    /// `data:` mark (`engine/marks.rs` — an `ellipse`/`checkbox` whose
    /// binding does not match) reserves its box by design so the
    /// blank↔filled workflow never shifts layout; that IS the same
    /// category as `visible:` and stamping it would be a reasonable
    /// widening, but it is not one this field makes today.
    ///
    /// The geometry is real — this is where the box WOULD have drawn — so
    /// a Designer can ghost it rather than showing an unexplained gap. A
    /// COLLAPSED item emits no `PlacedBox` at all: it has no position to
    /// report.
    ///
    /// Skipped when false, so the wire is byte-unchanged for every
    /// document that triggers neither cause.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub hidden: bool,
}

impl PlacedBox {
    /// The placement shifted down by `dy` — the box analog of the item
    /// `translate` walk helper.
    pub(crate) fn shifted(&self, dy: f64) -> PlacedBox {
        let shift = |r: BoxRect| BoxRect { y: r.y + dy, ..r };
        PlacedBox {
            path: self.path.clone(),
            id: self.id.clone(),
            border: shift(self.border),
            content: shift(self.content),
            text: self.text.as_ref().map(|t| t.shifted(dy)),
            hidden: self.hidden,
        }
    }

    /// The placement shifted right by `dx` — the box analog of the item
    /// `translate_x` helper (flex cross/main placement).
    pub(crate) fn shifted_x(&self, dx: f64) -> PlacedBox {
        let shift = |r: BoxRect| BoxRect { x: r.x + dx, ..r };
        PlacedBox {
            path: self.path.clone(),
            id: self.id.clone(),
            border: shift(self.border),
            content: shift(self.content),
            text: self.text.as_ref().map(|t| t.shifted_x(dx)),
            hidden: self.hidden,
        }
    }
}

/// All placements, parallel to `LayoutDocument::pages` (`pages[i]` holds
/// the boxes drawn on page `i`, in walk order).
#[derive(Debug, Clone, Default, Serialize)]
pub struct BoxIndex {
    pub pages: Vec<Vec<PlacedBox>>,
}

/// Shifts a slice of placements by `dy` (companion to the item
/// `translate`).
pub(crate) fn translate_boxes(boxes: &[PlacedBox], dy: f64) -> Vec<PlacedBox> {
    boxes.iter().map(|b| b.shifted(dy)).collect()
}

/// Shifts a slice of placements right by `dx` (companion to
/// `translate_x`).
pub(crate) fn translate_boxes_x(boxes: &[PlacedBox], dx: f64) -> Vec<PlacedBox> {
    boxes.iter().map(|b| b.shifted_x(dx)).collect()
}

#[cfg(test)]
mod tests;
