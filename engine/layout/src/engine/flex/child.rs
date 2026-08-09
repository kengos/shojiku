//! Placing and measuring ONE flex/grid child.
//!
//! Split from [`super`] for the line budget; both functions are steps of
//! the same walk. `measure_row_cross` runs PARKED — its placement is
//! thrown away and only the one that follows describes what the author
//! gets — which is why it lives beside the real placement rather than
//! inside it.

use super::super::{Atom, Basis, Ctx};
use super::FlexKind;

impl Ctx<'_, '_> {
    /// The cross size of an auto-height row: the tallest child's OUTER
    /// height (vertical margins are already folded into every atom).
    /// Runs parked — this placement is thrown away, and only the one
    /// that follows describes what the author gets.
    ///
    /// Takes the already-classified `kinds` rather than the raw items:
    /// `bases` is indexed by flex-child position, so re-deriving the
    /// classification here would mean re-deriving that alignment too.
    pub(super) fn measure_row_cross(
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

    /// Lays out one flex/grid child against its assigned basis (the
    /// parent content box in a column; the planned slot in a row; the
    /// cell in a grid).
    pub(in crate::engine) fn flex_child_atom(
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
