//! The horizontal-overflow policy: the one home for every "does this
//! reach past the box that holds it?" check, so the rules can be read
//! against each other instead of being inferred from three call sites.
//!
//! Three bounds, one per placement context:
//!
//! - [`Ctx::check_sheet_edge`] — a band / absolute-body item, bounded by
//!   the PAPER. Reaching into the page margins is a deliberate escape
//!   hatch (a full-bleed background, a rule wider than the text column),
//!   so only ink that leaves the sheet is a defect.
//! - [`Ctx::check_child_right`] — a column or absolutely-positioned box
//!   child, bounded by its parent's content box. A container has no
//!   reserve to bleed into, so this is the horizontal counterpart of
//!   `container_overflow`.
//! - [`Ctx::check_track_width`] — a grid child, bounded by its
//!   column-track run.
//!
//! Each reports its OWN code carrying only numbers — `sheet_overflow`,
//! `child_overflow`, `grid_column_overflow` — rather than the older
//! `horizontal_overflow`, whose single free-text `{detail}` arg holds a
//! whole English sentence a translating consumer can only pass through.
//! One code per reason, because a shared code with a `{where}` arg would
//! put an English enum value in front of a non-English reader just the
//! same. (`horizontal_overflow` still serves its three pre-existing
//! sites: the flow region, the flex row pre-pass, and vertical text.)
//!
//! Two invariants hold across all three. A FILLING item (`rb.w` unset)
//! is sized from its basis and can never overflow it, so it is never
//! checked — and an item with no box at all (a `line`) has no border box
//! to measure. And each fires inside the item's own `enter_item` mark,
//! so the diagnostic names the item rather than its parent.
//!
//! The row-level check for a flex ROW lives in `flex::offsets::plan_row`
//! instead: it speaks for the whole row at once (fixed widths + gaps vs
//! the content box) rather than for one child, which is why row children
//! are deliberately excluded from `check_child_right`.

use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::{Atom, Basis, Ctx, H_OVERFLOW_EPS};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Warns when a definite-width band / absolute-body item reaches past
    /// the right edge of the SHEET.
    ///
    /// The sheet edge is the margin box plus the right margin, which is
    /// exactly how `assemble` built the page basis — so no page width
    /// needs carrying on `Ctx`.
    pub(super) fn check_sheet_edge(&mut self, atom: &Atom, basis: &Basis) {
        let sheet_right = basis.x + basis.w + self.page_margin[1];
        let right = match atom.rb.and_then(|rb| rb.w.map(|w| (rb, w))) {
            Some((rb, w)) => rb.x + w + rb.margin[1],
            // A box-less atom — a `line`, whose geometry IS its endpoints —
            // has no border box to measure, so fall back to the right edge
            // of what it actually placed. Its `PlacedBox` is the endpoint
            // bounding box, which is the same rectangle the stroke inks.
            // A FILLING atom (a box with `w` unset) is bounded by its basis
            // and is deliberately not reached here. An atom that placed
            // NOTHING needs no arm of its own: the empty fold is
            // `-inf`, which cannot exceed the sheet.
            None => atom
                .boxes
                .iter()
                .map(|b| b.border.x + b.border.w)
                .fold(f64::NEG_INFINITY, f64::max),
        };
        let over = right - sheet_right;
        if over > H_OVERFLOW_EPS {
            self.diags
                .push(Diagnostic::new(Code::SheetOverflow).arg("over", over));
        }
    }

    /// Warns when one child's border box (plus its right margin) reaches
    /// past the right edge of `basis` — the parent content box for a
    /// column child or an absolutely-positioned one.
    ///
    /// `clipped` carries the `overflow: hidden` opt-in: a parent that
    /// clips by intent stays silent (the `container_overflow`
    /// convention).
    pub(in crate::engine) fn check_child_right(
        &mut self,
        atom: &Atom,
        basis: &Basis,
        clipped: bool,
    ) {
        if clipped {
            return;
        }
        let Some((rb, w)) = atom.rb.and_then(|rb| rb.w.map(|w| (rb, w))) else {
            return;
        };
        let over = (rb.x - basis.x) + w + rb.margin[1] - basis.w;
        if over > H_OVERFLOW_EPS {
            // States the MAGNITUDE, never a side. Which side the excess
            // lands on is decided after this pass: `column_offsets` feeds
            // the (negative) free space to `cross_offset`, so
            // `alignItems: center` puts half of it past the LEFT edge and
            // `end` puts all of it there. Only the amount is invariant.
            self.diags.push(
                Diagnostic::new(Code::ChildOverflow)
                    .arg("avail", basis.w)
                    .arg("over", over),
            );
        }
    }

    /// Warns when a grid child is wider than the column-track run it was
    /// placed in — the column-axis counterpart of the row-track check,
    /// reported through the same `grid_cell_overflow` code and
    /// distinguished by `extent`.
    ///
    /// Column tracks are always definite (unlike auto rows, which grow to
    /// their tallest child), so a definite-width child either fits or
    /// spills over the neighbouring track. Like the row check — and
    /// unlike [`Self::check_child_right`] — this fires regardless of
    /// `overflow: hidden`: the clip is the PARENT's opt-in and says
    /// nothing about a child colliding with its sibling's track.
    pub(super) fn check_track_width(&mut self, atom: &Atom, basis: &Basis, cols: usize) {
        let Some((rb, w)) = atom.rb.and_then(|rb| rb.w.map(|w| (rb, w))) else {
            return;
        };
        let child = (rb.x - basis.x) + w + rb.margin[1];
        if child > basis.w + H_OVERFLOW_EPS {
            self.diags.push(
                Diagnostic::new(Code::GridColumnOverflow)
                    .arg("child", child)
                    .arg("track", basis.w)
                    .arg("span", cols as f64),
            );
        }
    }
}
