//! The `cell:` column arm: a table cell hosting freely placed items.
//!
//! The cell IS the coordinate origin — a child's `box.x`/`box.y` measure
//! from the cell's own top-left corner, not from a padded inset, so
//! `cellPadding` (a text/qr/image knob) leaves it alone and the author
//! insets with `cell.box.padding` instead.
//!
//! An auto row lays each container cell out TWICE: once against an
//! unknown height to learn what it needs (the row height is the tallest
//! cell's), then once against the row's decided height to draw. Only the
//! second pass speaks — see `engine::cell::begin_measure`.

use crate::boxes::PlacedBox;
use crate::style::ComputedStyle;
use crate::tree::LayoutItem;
use shojiku_core::ContainerItem;

use super::super::super::cell::CellSlot;
use super::super::super::{Ctx, Scope};
use super::Cell;

impl<'a, 'b> Ctx<'a, 'b> {
    /// The height one container cell needs, from a measure pass against an
    /// unknown slot height. The caller has already descended into the
    /// cell's column, so a path built during the pass matches the render
    /// one.
    pub(super) fn measure_cell(
        &mut self,
        (item, scope): (&ContainerItem, Scope),
        computed: &ComputedStyle,
        (cx, width): (f64, f64),
    ) -> f64 {
        let parked = self.begin_measure();
        let fill = self.cell_under_column(
            item,
            computed,
            &CellSlot {
                x: cx,
                w: width,
                h: None,
            },
            scope,
        );
        self.end_measure(parked);
        fill.height
    }

    /// Draws one container cell into the decided row: the cell fills the
    /// column's rectangle (`cx`, the row band's top, `width` × `row_h`)
    /// like a `repeat` cell fills its grid slot, so `%` lengths and
    /// `verticalAlign` inside resolve against the row's real height.
    /// Content past a too-short row is the cell's own `overflow` story.
    pub(super) fn cell_container(
        &mut self,
        cell: &Cell<'_>,
        (item, scope): (&ContainerItem, Scope),
        (cx, row_h): (f64, f64),
        (items, boxes): (&mut Vec<LayoutItem>, &mut Vec<PlacedBox>),
    ) {
        let fill = self.cell_under_column(
            item,
            &cell.computed,
            &CellSlot {
                x: cx,
                w: cell.width,
                h: Some(row_h),
            },
            scope,
        );
        // The cell's items already carry absolute x and a y relative to
        // the slot top — which IS the row atom's origin.
        items.extend(fill.items);
        boxes.extend(fill.boxes);
    }

    /// Runs the shared cell with the COLUMN's resolved style as the
    /// inherited context: the row layer (zebra included) and the column
    /// layer cascade into the cell's items exactly as they do into a text
    /// column's block — `row_atom` runs after `table_row_atom` restored
    /// the table cascade, so without this swap the cell would inherit the
    /// table layer only. (`cell.computed`'s verticalAlign override is
    /// harmless here: verticalAlign is not an inherited property, so the
    /// child cascade resets it.)
    fn cell_under_column(
        &mut self,
        item: &ContainerItem,
        computed: &ComputedStyle,
        slot: &CellSlot,
        scope: Scope,
    ) -> super::super::super::cell::CellFill {
        let saved = self.inherited.clone();
        self.inherited = computed.clone();
        let fill = self.layout_cell_slot(item, slot, scope);
        self.inherited = saved;
        fill
    }
}
