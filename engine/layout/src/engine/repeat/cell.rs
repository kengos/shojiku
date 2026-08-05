//! One imposition cell: the `repeat` face of the shared slot-filling
//! cell — a grid slot at an absolute page position, always definite.

use crate::boxes::{translate_boxes, PlacedBox};
use crate::tree::LayoutItem;
use serde_json::Value;
use shojiku_core::ContainerItem;
use std::rc::Rc;

use super::super::cell::CellSlot;
use super::super::{translate, Ctx, Scope};
use super::Slot;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds one `repeat` cell's positioned items (absolute page
    /// coordinates): the shared cell fills the grid slot, and the result
    /// is lifted from the slot's top-left to its place on the page.
    pub(super) fn layout_cell(
        &mut self,
        cell: &ContainerItem,
        slot: Slot,
        element: Rc<Value>,
        (array_key, index): (&str, usize),
    ) -> (Vec<LayoutItem>, Vec<PlacedBox>) {
        let fill = self.layout_cell_slot(
            cell,
            &CellSlot {
                x: slot.x,
                w: slot.w,
                h: Some(slot.h),
            },
            Scope {
                catalog_key: array_key.to_string(),
                element,
                array_key: array_key.to_string(),
                index,
            },
        );
        (
            translate(&fill.items, slot.y),
            translate_boxes(&fill.boxes, slot.y),
        )
    }
}
