//! Flex child placement (box-model Phase 2): the shared box-children
//! walk. Children that author neither `box.x` nor `box.y` are flex
//! items placed along the parent box's main axis (`direction`, default
//! `column`) with `gap`, `justifyContent`, `alignItems`, and auto
//! margins; children with either coordinate keep the Phase-1 absolute
//! placement (`super::container::absolute_child_atom`). The
//! distribution math lives in `shojiku-layout-box`; this module walks
//! the template and measures content. Paint order stays document order.

mod baseline;
mod column;
mod kind;
mod offsets;
mod slots;

use shojiku_core::{AlignItems, FlexDirection, Item, JustifyContent, Length, OptBox};

use crate::boxes::PlacedBox;
use crate::tree::LayoutItem;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::{Atom, Basis, Ctx};

pub(in crate::engine) use kind::FlexKind;
pub(in crate::engine) use slots::{emit_slots, h_auto_margin, Slot};

/// Runaway cap on the placements the layout walk makes a SECOND time.
///
/// Three paths spend it, and all three have the same shape — a size that
/// cannot be known until something has been laid out, so the walk
/// measures once and then places for real:
///
/// - an auto-height `stretch` row, whose cross size is its tallest child;
/// - a `flexGrow` column, whose shares divide what its children's content
///   heights leave over;
/// - a grid whose `fr` rows must wait for an auto row to be measured.
///
/// Each of them re-places a CONTAINER's children, so nesting compounds
/// per level: `MAX_CONTAINER_DEPTH` of them is `2^32` placements. This is
/// the same shape of guard `MAX_PAGES` is, and like it the number is a
/// backstop rather than a budget an ordinary document approaches — a
/// definite-height row, a column nobody asked to grow, and a grid without
/// `fr` rows over an auto one each spend exactly nothing.
pub(in crate::engine) const MAX_REFLOW_PLACEMENTS: usize = 10_000;

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
        // Both axes plan their MAIN size before layout, and each child
        // keeps its document index so the plan's diagnostics land on the
        // same item the walk will name.
        //
        // Row: the side-by-side bases must be planned first (fixed widths
        // measured, unsized children sized from their content basis, then
        // the leftover split), because a child cannot lay out until it
        // knows its width. Column: the main size is the height, which a
        // child computes for itself — so the plan only has something to
        // say when `flexGrow` is authored, and returns `None` otherwise.
        let kinds: Vec<(usize, FlexKind)> = items
            .iter()
            .enumerate()
            .filter_map(|(i, c)| FlexKind::of(c).map(|k| (i, k)))
            .collect();
        let row = spec.direction == FlexDirection::Row;
        let bases = match spec.direction {
            FlexDirection::Row => Some(self.plan_row(&kinds, inner, &spec, clipped, depth)),
            FlexDirection::Column => self.plan_column(&kinds, inner, &spec, depth),
        };

        // An auto-height `stretch` row has no cross size to fill until
        // its tallest child is known. CSS (Flexbox §9.4): the line's
        // cross size is the largest of the items' hypothetical outer
        // cross sizes. So measure once — parked, so nothing the measure
        // says reaches the user — then place for real against what it
        // found. A DEFINITE-height row never gets here: its cross size
        // was known before any child laid out.
        let bases = match bases {
            Some(bases) if row && spec.align == AlignItems::Stretch && inner.h.is_none() => {
                if self.spend_reflow(bases.len()) {
                    let cross = self.measure_row_cross(&kinds, &bases, depth);
                    // The discovered cross size is a height to HAND DOWN,
                    // not a `%` base: the row is still auto-height, so a
                    // `%` height inside it stays `percent_of_auto` as CSS
                    // says it must.
                    Some(
                        bases
                            .into_iter()
                            .map(|b| Basis {
                                fill_h: Some(cross),
                                ..b
                            })
                            .collect(),
                    )
                } else {
                    Some(bases)
                }
            }
            other => other,
        };

        // Pass 1: lay out every child in document order.
        let mut slots = Vec::new();
        let mut flex_idx = 0;
        for (i, child) in items.iter().enumerate() {
            let mark = self.enter_item(format!("items[{i}]"));
            match FlexKind::of(child) {
                Some(kind) => {
                    // `bases` was built with the same `FlexKind::of`
                    // filter over the same items, so `flex_idx` is always
                    // in range.
                    let child_basis = match &bases {
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

    /// The cross size of an auto-height row: the tallest child's OUTER
    /// height (vertical margins are already folded into every atom).
    /// Runs parked — this placement is thrown away, and only the one
    /// that follows describes what the author gets.
    ///
    /// Takes the already-classified `kinds` rather than the raw items:
    /// `bases` is indexed by flex-child position, so re-deriving the
    /// classification here would mean re-deriving that alignment too.
    fn measure_row_cross(
        &mut self,
        kinds: &[(usize, FlexKind)],
        bases: &[Basis],
        depth: usize,
    ) -> f64 {
        let parked = self.begin_measure();
        let mut cross = 0.0_f64;
        for (i, (_, kind)) in kinds.iter().enumerate() {
            if let Some(atom) = self.flex_child_atom(*kind, &bases[i], depth) {
                cross = cross.max(atom.height);
            }
        }
        self.end_measure(parked);
        cross
    }

    /// Sanitizes an authored `flexGrow` weight: a negative or non-finite
    /// value warns (`invalid_flex_grow`) and degrades to 0 (never grows),
    /// matching the warn+clamp posture of the resolve guards. Shared by
    /// both axes' pre-passes — the key means the same thing whichever one
    /// is the main axis.
    fn grow_weight(&mut self, g: f64) -> f64 {
        if g.is_finite() && g >= 0.0 {
            g
        } else {
            self.diags
                .push(Diagnostic::new(Code::InvalidFlexGrow).arg("value", g));
            0.0
        }
    }

    /// Draws `n` placements from the re-placement budget, or reports the
    /// runaway once and refuses. Refusing is not a failure mode the
    /// author can hit by accident — it takes nested auto-height stretch
    /// rows, growing columns or `fr`-over-auto grids deep enough to be
    /// pathological — and the degradation is benign every time: the
    /// children keep the size they had before the feature that wanted a
    /// second look existed.
    ///
    /// Shared with the grid walk, whose `fr`-row correction spends from
    /// the same pool: a grid of grids where every row is an `fr` is the
    /// case that compounds per level.
    pub(in crate::engine) fn spend_reflow(&mut self, n: usize) -> bool {
        if self.reflow_budget >= n {
            self.reflow_budget -= n;
            return true;
        }
        // Raise a flag rather than warn here. The budget is drained from
        // INSIDE a parked measure pass — that is what a runaway is — and
        // `end_measure` discards everything such a pass said, so a
        // diagnostic pushed here is thrown away and, being once-only,
        // never emitted again. `layout()` reports the flag once the walk
        // is over.
        self.reflow_budget = 0;
        self.reflow_exhausted = true;
        false
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
