//! Flex child placement (box-model Phase 2): the shared box-children
//! walk. Children that author neither `box.x` nor `box.y` are flex
//! items placed along the parent box's main axis (`direction`, default
//! `column`) with `gap`, `justifyContent`, `alignItems`, and auto
//! margins; children with either coordinate keep the Phase-1 absolute
//! placement (`super::container::absolute_child_atom`). The
//! distribution math lives in `shojiku-layout-box`; this module walks
//! the template and measures content. Paint order stays document order.

mod baseline;
mod offsets;

use shojiku_core::{
    AlignItems, CharGridItem, CheckboxItem, ContainerItem, EllipseItem, FlexDirection, ImageItem,
    Item, JustifyContent, Length, ListItem, OptBox, QrCodeItem, RectItem, TableItem, TextItem,
};
use shojiku_layout_box::cross_offset;

use crate::boxes::{translate_boxes, translate_boxes_x, PlacedBox};
use crate::tree::LayoutItem;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::{translate, translate_x, Atom, Basis, Ctx};

/// The parent box's flex keys, defaulted (unset `box.type` is flex).
pub(super) struct FlexSpec {
    pub direction: FlexDirection,
    pub gap: Option<Length>,
    pub align: AlignItems,
    pub justify: JustifyContent,
}

impl FlexSpec {
    fn of(b: &OptBox) -> Self {
        FlexSpec {
            direction: b.direction.unwrap_or_default(),
            gap: b.gap,
            align: b.align_items.unwrap_or_default(),
            justify: b.justify_content.unwrap_or_default(),
        }
    }
}

/// A flex/grid-participating child: one of the box-atom kinds, authored
/// without `box.x` / `box.y`.
pub(super) enum FlexKind<'i> {
    Text(&'i TextItem),
    Rect(&'i RectItem),
    Image(&'i ImageItem),
    Container(&'i ContainerItem),
    QrCode(&'i QrCodeItem),
    List(&'i ListItem),
    CharGrid(&'i CharGridItem),
    Table(&'i TableItem),
    Ellipse(&'i EllipseItem),
    Checkbox(&'i CheckboxItem),
}

impl<'i> FlexKind<'i> {
    /// Classifies a child: `Some` participates in flex/grid placement.
    /// Lines (point-based) and the warn+skip kinds (`page_number` /
    /// `repeat`) always take the absolute path.
    pub(super) fn of(item: &'i Item) -> Option<Self> {
        let no_xy = |b: Option<&OptBox>| b.is_none_or(|b| b.x.is_none() && b.y.is_none());
        match item {
            Item::Text(t) if no_xy(t.box_.as_ref()) => Some(FlexKind::Text(t)),
            Item::Rect(r) if no_xy(Some(&r.box_)) => Some(FlexKind::Rect(r)),
            Item::Image(i) if no_xy(i.box_.as_ref()) => Some(FlexKind::Image(i)),
            Item::Container(c) if no_xy(c.box_.as_ref()) => Some(FlexKind::Container(c)),
            Item::QrCode(q) if no_xy(q.box_.as_ref()) => Some(FlexKind::QrCode(q)),
            Item::List(l) if no_xy(l.box_.as_ref()) => Some(FlexKind::List(l)),
            Item::CharGrid(g) if no_xy(g.box_.as_ref()) => Some(FlexKind::CharGrid(g)),
            Item::Table(t) if no_xy(t.box_.as_ref()) => Some(FlexKind::Table(t)),
            Item::Ellipse(e) if no_xy(Some(&e.box_)) => Some(FlexKind::Ellipse(e)),
            Item::Checkbox(c) if no_xy(c.box_.as_ref()) => Some(FlexKind::Checkbox(c)),
            _ => None,
        }
    }

    /// The child's authored box (`repeat`-style defaulting).
    pub(super) fn box_(&self) -> OptBox {
        match self {
            FlexKind::Text(t) => t.box_.clone().unwrap_or_default(),
            FlexKind::Rect(r) => r.box_.clone(),
            FlexKind::Image(i) => i.box_.clone().unwrap_or_default(),
            FlexKind::Container(c) => c.box_.clone().unwrap_or_default(),
            FlexKind::QrCode(q) => q.box_.clone().unwrap_or_default(),
            FlexKind::List(l) => l.box_.clone().unwrap_or_default(),
            FlexKind::CharGrid(g) => g.box_.clone().unwrap_or_default(),
            FlexKind::Table(t) => t.box_.clone().unwrap_or_default(),
            FlexKind::Ellipse(e) => e.box_.clone(),
            FlexKind::Checkbox(c) => c.box_.clone().unwrap_or_default(),
        }
    }
}

/// One laid-out child, in document order (paint order is preserved).
pub(super) enum Slot {
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
pub(super) fn emit_slots(
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

impl<'a, 'b> Ctx<'a, 'b> {
    /// Lays out a box's children against `inner` (the already-resolved
    /// parent content box), returning the positioned items, their
    /// id-addressable placements, and the lowest child bottom edge.
    /// Shared by containers and `repeat` cells; the caller sets the
    /// style cascade and any data scope on `self` first. Children carry
    /// absolute x and y relative to the box top.
    pub(super) fn layout_box_children(
        &mut self,
        items: &[Item],
        inner: &Basis,
        parent_box: &OptBox,
        depth: usize,
        clipped: bool,
    ) -> (Vec<LayoutItem>, Vec<PlacedBox>, f64) {
        // `box.type: grid` takes the static-grid walk; everything else
        // (unset or `flex`) is flex-like.
        if parent_box.type_ == Some(shojiku_core::BoxType::Grid) {
            return self.layout_grid_children(items, inner, parent_box, depth, clipped);
        }
        let spec = FlexSpec::of(parent_box);
        // Grid spans are inert outside `box.type: grid`; a span key
        // on a flex child is almost certainly a missing `type: grid` on
        // the parent, so surface it.
        for (i, child) in items.iter().enumerate() {
            if let Some(kind) = FlexKind::of(child) {
                if kind.box_().has_span_keys() {
                    let mark = self.enter_item(format!("items[{i}]"));
                    self.diags.push(Diagnostic::new(Code::SpanOutsideGrid));
                    self.leave_item(mark);
                }
            }
        }
        // Row: the side-by-side bases must be planned before layout
        // (fixed widths measured, leftover split equally). Each child
        // keeps its document index so the plan's diagnostics land on the
        // same item the walk will name.
        let row_bases = if spec.direction == FlexDirection::Row {
            let kinds: Vec<(usize, FlexKind)> = items
                .iter()
                .enumerate()
                .filter_map(|(i, c)| FlexKind::of(c).map(|k| (i, k)))
                .collect();
            Some(self.plan_row(&kinds, inner, &spec, clipped))
        } else {
            None
        };

        // Pass 1: lay out every child in document order.
        let mut slots = Vec::new();
        let mut flex_idx = 0;
        for (i, child) in items.iter().enumerate() {
            let mark = self.enter_item(format!("items[{i}]"));
            match FlexKind::of(child) {
                Some(kind) => {
                    // `row_bases` was built with the same `FlexKind::of`
                    // filter over the same items, so `flex_idx` is always
                    // in range.
                    let child_basis = match &row_bases {
                        Some(bases) => bases[flex_idx],
                        None => *inner,
                    };
                    flex_idx += 1;
                    if let Some(atom) = self.flex_child_atom(kind, &child_basis, depth) {
                        // A ROW child is already spoken for by `plan_row`'s
                        // row-level check; checking it again here would
                        // report the same overflow twice.
                        if spec.direction == FlexDirection::Column {
                            self.check_child_right(&atom, inner, clipped);
                        }
                        slots.push(Slot::Flex(atom));
                    }
                }
                None => {
                    if let Some((atom, dy)) = self.absolute_child_atom(child, inner, depth) {
                        self.check_child_right(&atom, inner, clipped);
                        slots.push(Slot::Abs(atom, dy));
                    }
                }
            }
            self.leave_item(mark);
        }

        // Pass 2: main/cross offsets for the flex items that produced
        // atoms (a skipped child leaves its planned row slot empty).
        let flex_atoms: Vec<&Atom> = slots
            .iter()
            .filter_map(|slot| match slot {
                Slot::Flex(atom) => Some(atom),
                Slot::Abs(..) => None,
            })
            .collect();
        let offs = match spec.direction {
            FlexDirection::Column => self.column_offsets(&flex_atoms, inner, &spec),
            FlexDirection::Row => offsets::row_cross(&flex_atoms, inner, &spec, self.input.fonts),
        };

        // Pass 3: emit in document order with the computed shifts.
        emit_slots(&slots, &offs)
    }

    /// Lays out one flex/grid child against its assigned basis (the
    /// parent content box in a column; the planned slot in a row; the
    /// cell in a grid).
    pub(super) fn flex_child_atom(
        &mut self,
        kind: FlexKind,
        basis: &Basis,
        depth: usize,
    ) -> Option<Atom> {
        match kind {
            FlexKind::Text(text) => Some(self.text_atom(text, basis)),
            FlexKind::Rect(rect) => self.rect_atom(rect, basis),
            FlexKind::Image(image) => self.guarded_image_atom(image, basis),
            FlexKind::Container(container) => self.container_atom(container, basis, depth + 1),
            FlexKind::QrCode(qr) => self.qr_atom(qr, basis),
            FlexKind::List(list) => self.list_atom(list, basis),
            // A boxed char_grid draws one sheet (band semantics: no
            // pagination; overflow warns and drops).
            FlexKind::CharGrid(grid) => self.char_grid_atom(grid, basis),
            // A boxed table is one bounded block (no pagination; cell
            // scope gates it).
            FlexKind::Table(table) => self.guarded_table_atom(table, basis),
            FlexKind::Ellipse(e) => self.ellipse_atom(e, basis),
            FlexKind::Checkbox(c) => self.checkbox_atom(c, basis),
        }
    }
}

/// Applies horizontal auto margins to a flow item's atom (the flow body
/// is the column-flex special case): with an authored width and `auto`
/// left/right margins, the atom shifts within the region like a flex
/// child — `{ left: auto, right: auto }` centers, a single `auto`
/// pushes to the opposite edge. No-op without auto margins or without
/// a definite width (a filling item leaves no free space).
pub(super) fn h_auto_margin(atom: Atom, region: &Basis) -> Atom {
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
