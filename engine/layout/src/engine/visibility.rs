//! Params-conditional item visibility: turns an item's `visible:` binding
//! into one of three placement verdicts, and blanks the atom of a hidden
//! one.
//!
//! Every walk that places items — flow, band, absolute body, flex, grid —
//! asks [`Ctx::child_visibility`] ONCE for its whole child list and then
//! consults the answer. Once, for two reasons: the predicate's
//! array-contains path is O(params array length), so re-asking per pass
//! would let params drive the cost twice over; and the two fault
//! diagnostics are pushed at evaluation, so a second evaluation would
//! report the same mistake twice.

use shojiku_core::Item;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::predicate::PredicateEval;
use super::{Atom, Ctx, PageBuild};

/// What a walk should do with one child.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::engine) enum Visibility {
    /// No `visible:` binding, or its predicate holds: place normally.
    Draw,
    /// Reserve the box, paint nothing (CSS `visibility: hidden`).
    Hidden,
    /// Generate no box at all; siblings close up over it, gaps included
    /// (CSS `display: none`).
    Collapsed,
}

impl Visibility {
    /// Whether the walk should skip this child entirely.
    pub(in crate::engine) fn is_collapsed(self) -> bool {
        self == Visibility::Collapsed
    }
}

/// Strips everything an atom would DRAW while keeping the space it
/// reserves: the height, the resolved box flex placement reads, and the
/// placements `inspect` reports — each stamped `hidden` so a Designer can
/// ghost the item instead of showing an unexplained gap.
///
/// Blanking after the fact (rather than not laying the item out) is what
/// makes the reserved slot exactly the size it would have been: the
/// height of a wrapped text block or an auto-height container is only
/// knowable by measuring it.
pub(in crate::engine) fn blank_if(atom: Atom, hidden: bool) -> Atom {
    if hidden {
        blank(atom)
    } else {
        atom
    }
}

pub(in crate::engine) fn blank(atom: Atom) -> Atom {
    Atom {
        height: atom.height,
        items: Vec::new(),
        boxes: atom
            .boxes
            .into_iter()
            .map(|mut b| {
                b.hidden = true;
                b
            })
            .collect(),
        rb: atom.rb,
    }
}

/// How much had been drawn before a hidden item was placed, per page.
///
/// The atom-returning arms can simply be [`blank`]ed, but the paginating
/// ones (a split text block, a table, a `repeat`) push straight into the
/// pages and hand back nothing — so hiding those needs a before/after
/// mark rather than a value to transform.
pub(in crate::engine) struct DrawMark {
    pages: Vec<(usize, usize)>,
    /// How many anchored lines were deferred before this item was placed.
    /// A deferred line never rides the atom blanking transforms, so it is
    /// hidden HERE or not at all — see [`super::anchor`].
    anchors: usize,
}

/// Records the current draw state of every page.
pub(in crate::engine) fn draw_mark(pages: &[PageBuild], anchors: usize) -> DrawMark {
    DrawMark {
        pages: pages
            .iter()
            .map(|p| (p.items.len(), p.boxes.len()))
            .collect(),
        anchors,
    }
}

/// Blanks everything drawn since `mark`: the drawn primitives are
/// dropped, and every placement added since is stamped `hidden`.
///
/// Pages the item OPENED stay open. A hidden item still reserves what it
/// would have occupied, and for a paginating item that is measured in
/// pages — dropping them would be the `collapse:` behaviour, which the
/// author did not ask for.
pub(in crate::engine) fn blank_since(
    pages: &mut [PageBuild],
    mark: &DrawMark,
    anchors: &mut [super::anchor::PendingAnchor],
) {
    // Deferred lines are STAMPED rather than dropped, which is what makes
    // a hidden anchored line report where it would have drawn — the same
    // contract the placements below get.
    let from = mark.anchors.min(anchors.len());
    for pending in &mut anchors[from..] {
        pending.hidden = true;
    }
    for (index, page) in pages.iter_mut().enumerate() {
        let (items, boxes) = mark.pages.get(index).copied().unwrap_or((0, 0));
        page.items.truncate(items);
        // Every write path into a page is a push/extend, so a page's box
        // count cannot SHRINK between the mark and here. The clamp is
        // defensive only — kept because indexing past the end would panic,
        // and asserted so the assumption is checked in debug rather than
        // merely believed.
        debug_assert!(boxes <= page.boxes.len(), "a page's boxes cannot shrink");
        let from = boxes.min(page.boxes.len());
        for placed in &mut page.boxes[from..] {
            placed.hidden = true;
        }
    }
}

impl Ctx<'_, '_> {
    /// The verdict for one item. Enters the item's own path mark so a
    /// fault diagnostic lands on the item that authored the binding.
    fn visibility_at(&mut self, item: &Item, index: usize) -> Visibility {
        let Some(binding) = item.visible() else {
            return Visibility::Draw;
        };
        let mark = self.enter_item(format!("items[{index}]"));
        let verdict = self.eval_presence(&binding.key, binding.equals.as_ref(), binding.scope());
        // A fault behaves as "not shown", exactly as a form mark's does —
        // consistency with the surface being generalized is the whole
        // point — and says so, naming the key but never echoing the value.
        let code = match verdict {
            PredicateEval::Apply | PredicateEval::Skip => None,
            PredicateEval::TypeMismatch => Some(Code::VisibleTypeMismatch),
            PredicateEval::NotBool => Some(Code::VisibleValueNotBool),
        };
        if let Some(code) = code {
            self.diags
                .push(Diagnostic::new(code).arg("key", &binding.key));
        }
        self.leave_item(mark);
        match verdict {
            PredicateEval::Apply => Visibility::Draw,
            // A `page_break` paints nothing and reserves no box, so
            // "reserve the box, paint nothing" has nothing to mean for
            // it: the only reading of a failing predicate is that the
            // break does not happen. Collapsing it unconditionally is
            // what makes a CONDITIONAL page break authorable without
            // `collapse: true` boilerplate that could not mean anything
            // else anyway.
            _ if binding.collapse() || matches!(item, Item::PageBreak(_)) => Visibility::Collapsed,
            _ => Visibility::Hidden,
        }
    }

    /// The verdict for every child of one item list, in document order.
    ///
    /// Indexed by document position, so a walk that filters collapsed
    /// children still addresses the survivors by their AUTHORED index —
    /// the structural `path` contract (`items[3]`) never renumbers.
    pub(in crate::engine) fn child_visibility(&mut self, items: &[Item]) -> Vec<Visibility> {
        items
            .iter()
            .enumerate()
            .map(|(i, item)| self.visibility_at(item, i))
            .collect()
    }
}

#[cfg(test)]
mod tests;
