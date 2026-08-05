//! Sheet-level placement: the one emit tail every band and absolute-body
//! item goes through, and the page-edge overflow check it carries.
//!
//! Bands and the absolute body are the two walks that place items
//! straight onto a page rather than into a flow region or a container, so
//! they are also the only two whose items can leave the paper without any
//! enclosing box noticing.

use crate::boxes::translate_boxes;

use super::{translate, Atom, Basis, Ctx, PageBuild};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Places one band / absolute-body atom at `dy` into the page under
    /// construction, checking the sheet edge on the way in.
    pub(super) fn emit_placed(&mut self, out: &mut PageBuild, atom: Atom, dy: f64, basis: &Basis) {
        self.check_sheet_edge(&atom, basis);
        out.items.extend(translate(&atom.items, dy));
        out.boxes.extend(translate_boxes(&atom.boxes, dy));
    }
}
