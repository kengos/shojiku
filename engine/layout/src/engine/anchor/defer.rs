//! Deferral: the one place a [`PendingAnchor`] is made.
//!
//! The walk arms (`line_atom`, `ellipse_atom`) decide THAT an item is
//! anchored; this module removes it from the walk. Keeping every record's
//! construction here is what keeps the fields a record must carry — its
//! path, its visibility stamp, the band page it repeats on — from being set
//! in one arm and forgotten in the other.

use shojiku_core::EllipseItem;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::{PendingAnchor, PendingEllipse, PendingKind};
use crate::engine::{Atom, Basis, Ctx};

impl Ctx<'_, '_> {
    /// Removes an anchored item from the walk: records it for the drain and
    /// returns the atom the walk places in its stead — no height, nothing
    /// drawn, no placement. All three come from the drain, on the target's
    /// page, in that page's coordinates.
    pub(in crate::engine) fn defer(&mut self, kind: PendingKind, id: Option<String>) -> Atom {
        self.pending_anchors.push(PendingAnchor {
            kind,
            path: self.current_path(),
            id,
            hidden: false,
            band_page: None,
        });
        Atom {
            height: 0.0,
            items: Vec::new(),
            boxes: Vec::new(),
            rb: None,
        }
    }

    /// Defers an `ellipse` circling `target`, or skips it with
    /// `mark_missing_size` when an authored `box.w`/`box.h` is not a
    /// positive size — the guard an unanchored ellipse gets, applied per
    /// axis because an anchored one may leave either axis unset (it then
    /// takes the band's extent). Without it a negative width would draw a
    /// mirrored oval and report a negative-width placement, and a zero one
    /// a degenerate path, both silently.
    ///
    /// An axis that does not RESOLVE (a `%` under an auto-height parent, a
    /// value past the resolve cap) has already warned and falls back to the
    /// band, as before.
    pub(in crate::engine) fn defer_ellipse(
        &mut self,
        e: &EllipseItem,
        target: &str,
        basis: &Basis,
        drawn: bool,
    ) -> Option<Atom> {
        let b = e.box_.as_ref();
        let size = (
            b.and_then(|b| b.w)
                .and_then(|l| self.resolve_x(Some(l), basis)),
            b.and_then(|b| b.h)
                .and_then(|l| self.resolve_y(Some(l), basis)),
        );
        let positive = |v: Option<f64>| v.is_none_or(|v| v.is_finite() && v > 0.0);
        if !(positive(size.0) && positive(size.1)) {
            self.diags.push(Diagnostic::new(Code::MarkMissingSize));
            return None;
        }
        let paint = self.shape_paint(&e.style_names, &e.style, "ellipse");
        let kind = PendingKind::Ellipse(PendingEllipse {
            target: target.to_string(),
            paint,
            size,
            drawn,
        });
        Some(self.defer(kind, e.id.clone()))
    }

    /// Pins every record deferred since `from` to the band page `page`
    /// (0-based). A band is laid out once per page, so each copy of an
    /// anchored band item resolves against its OWN page rather than the
    /// first page its target appears on.
    pub(in crate::engine) fn pin_to_band_page(&mut self, from: usize, page: usize) {
        for pending in self.pending_anchors.iter_mut().skip(from) {
            pending.band_page = Some(page);
        }
    }
}
