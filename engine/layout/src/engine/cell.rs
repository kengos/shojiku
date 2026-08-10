//! The slot-filling, data-scoped cell: the ONE home for the container a
//! `repeat` places per array element and a table column's `cell:` places
//! per row. Both fill a rectangular slot, cascade their own style, scope
//! their bindings to the bound element, and clip on `overflow: hidden` —
//! only the slot's origin and how its height is decided differ.

use crate::boxes::{translate_boxes, PlacedBox};
use crate::tree::LayoutItem;
use shojiku_core::{ContainerItem, Overflow};
use shojiku_diagnostics::Diagnostics;

use super::{container, placed_box, translate, Basis, Ctx, Scope};

/// The rectangle a cell fills, relative to the caller's own origin (a
/// page for `repeat`, the row band's top-left for a table column).
pub(super) struct CellSlot {
    /// The slot's left edge; the cell's `box.x` offsets within it.
    pub x: f64,
    /// The slot's width; the cell fills it unless `box.w` sizes it.
    pub w: f64,
    /// The slot's height. `Some` = a definite slot the cell fills like a
    /// definite-height box (a `repeat` grid slot, a table row of known
    /// height). `None` = auto: the height comes from the cell's content —
    /// the table row-height measure, where the row is what the cells
    /// decide.
    pub h: Option<f64>,
}

/// One laid-out cell, positioned relative to its slot's top-left.
pub(super) struct CellFill {
    pub items: Vec<LayoutItem>,
    pub boxes: Vec<PlacedBox>,
    /// The height the cell occupies in the slot: its `box.y` offset, its
    /// border box, and its bottom margin. This is what an auto-height
    /// row measures.
    pub height: f64,
}

/// The engine state a measure pass must not disturb, parked while it
/// runs.
pub(super) struct Measured {
    diags: Diagnostics,
    families: std::collections::HashSet<String>,
    formats: std::collections::HashSet<String>,
    row_conditions: std::collections::HashSet<String>,
    /// How many deferred anchors existed before the pass — see
    /// [`Ctx::begin_measure`].
    anchors: usize,
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Parks the diagnostic state so the walk that follows is a MEASURE
    /// pass whose output nobody hears: a table row lays its container
    /// cells out twice (once against an unknown height to find the row's,
    /// once against the row's real height to draw), and only the second
    /// pass describes what the author actually gets. Without this a
    /// `%`-height child would warn `percent_of_auto` from the measure
    /// pass alone — about a length the render pass resolves cleanly.
    ///
    /// The once-per-key warning ledgers are parked too: they are the
    /// reason this cannot be a plain `diags` swap. A measure-pass
    /// `unknown_font_family` would mark the family "already warned" and
    /// SILENCE the render pass's real one, turning a discarded warning
    /// into a lost one.
    pub(super) fn begin_measure(&mut self) -> Measured {
        Measured {
            diags: std::mem::take(&mut self.diags),
            families: std::mem::take(&mut self.warned_families),
            formats: std::mem::take(&mut self.warned_formats),
            row_conditions: std::mem::take(&mut self.warned_row_conditions),
            // Deferred anchors are walk-global and drained once, at the end
            // of `layout()` — so one pushed by a THROWAWAY pass would be
            // drawn for real. Parked by LENGTH rather than by value: a
            // measure pass only ever appends.
            anchors: self.pending_anchors.len(),
        }
    }

    /// Ends a measure pass, discarding everything it said.
    pub(super) fn end_measure(&mut self, parked: Measured) {
        self.diags = parked.diags;
        self.warned_families = parked.families;
        self.warned_formats = parked.formats;
        self.warned_row_conditions = parked.row_conditions;
        self.pending_anchors.truncate(parked.anchors);
    }

    /// Lays out one slot-filling cell, data-scoped to `scope`, with its
    /// items and placements relative to the SLOT's top-left (the caller
    /// translates them to their final home). Children resolve against the
    /// slot, which the cell fills by default so `%` lengths and
    /// `verticalAlign` behave like a definite-height box; an explicit
    /// `cell.box` insets or resizes the cell within the slot. The cell's
    /// `style`/`styleNames` cascade to the children, and `data:` bindings
    /// read the bound array element (table row-scoping, generalized).
    pub(super) fn layout_cell_slot(
        &mut self,
        cell: &ContainerItem,
        slot: &CellSlot,
        scope: Scope,
    ) -> CellFill {
        // The cell container is addressable as `<owner>.cell`; its
        // children are `<owner>.cell.items[j]` (the child walk appends
        // `items[j]`).
        let cell_mark = self.enter_item("cell".to_string());
        let slot_basis = Basis {
            x: slot.x,
            w: slot.w,
            h: slot.h,
            font: self.font_rel(),
            pct_w: None,
            fill_h: None,
        };
        let b = cell.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, &slot_basis);
        let dy = self.resolve_y(b.y, &slot_basis).unwrap_or(0.0) + rb.margin[0];
        let w = rb.w_or_fill(&slot_basis, 0.0);

        let saved_style = self.inherited.clone();
        self.inherited = self.resolve_style(&cell.style_names, &cell.style);
        // The cell's computed style also carries its decoration, drawn
        // under the children below (same pattern as `container_atom` —
        // pushed before `inner` so a child `em` sees the cell's font size).
        let computed = self.inherited.clone();

        // An authored `box.h` wins; otherwise a definite slot hands the
        // cell the room left under `box.y` and its margins, and an auto
        // slot leaves the height to the content below.
        let definite = match (rb.h, slot.h) {
            (Some(h), _) => Some(h),
            (None, Some(slot_h)) => Some((slot_h - dy - rb.margin[2]).max(0.0)),
            (None, None) => None,
        };

        // Children resolve against the cell's content box (border box
        // minus padding), clamped like a container's.
        let inner = Basis {
            x: rb.content_x(),
            w: rb.content_w(w),
            h: definite.map(|h| rb.content_h(h)),
            font: self.font_rel(),
            pct_w: None,
            fill_h: None,
        };
        let saved_scope = self.scope.take();
        self.scope = Some(scope);

        let clipped = computed.overflow == Overflow::Hidden;
        let (items, child_boxes, bottom) =
            self.layout_box_children(&cell.items, &inner, &b, 1, clipped);

        self.scope = saved_scope;
        self.inherited = saved_style;

        // Auto height: the content plus padding, clamped to the box's
        // min/max bounds — a container's rule, so an auto table row and an
        // auto container agree on what a cell is worth.
        let h = definite.unwrap_or_else(|| rb.clamp_h(bottom + rb.v_padding()));

        let mut boxes = Vec::with_capacity(child_boxes.len() + 1);
        // The cell's own placement (one per bound element, so the `…cell`
        // path appears once per instance).
        let placed = placed_box(&self.current_path(), cell.id.as_deref(), &rb, w, h);
        boxes.push(placed.shifted(dy));
        boxes.extend(translate_boxes(&child_boxes, dy + rb.padding[0]));
        // Decoration covers the cell's border box (no padding shift),
        // painted before — under — the children. With `overflow: hidden`
        // the children clip to the cell's border box, decoration outside
        // the clip like a container's.
        let mut decorated = Vec::with_capacity(items.len() + 1);
        let clip_radius = self.push_decoration(&mut decorated, &computed, rb.x, w, h);
        let mut out = translate(&decorated, dy);
        let children = translate(&items, dy + rb.padding[0]);
        if clipped {
            out.push(container::clip_children(
                children,
                rb.x,
                dy,
                w,
                h,
                clip_radius,
            ));
        } else {
            out.extend(children);
        }
        self.leave_item(cell_mark);
        CellFill {
            items: out,
            boxes,
            height: (dy + h + rb.margin[2]).max(0.0),
        }
    }
}
