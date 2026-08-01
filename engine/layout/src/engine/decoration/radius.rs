//! `borderRadius` resolution: an authored [`Length`] plus the box's own
//! size become the concrete [`Corners`] the tree carries.
//!
//! CSS resolves a percentage radius against the two axes independently
//! (horizontal against the border-box width, vertical against its
//! height), which is what makes `50%` a circle on a square box and a
//! pill on an oblong one. Every other unit is one length, so both axes
//! get it. The guard is split from the [`Ctx`] method so the hostile
//! branches are unit-testable without a layout.

use crate::style::ComputedStyle;
use crate::tree::Corners;
use shojiku_core::Length;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::Basis;

use super::super::Ctx;

/// Whether a resolved radius is usable. Rejects non-finite and negative
/// values (a hostile template's `-5` or `1e300 * %`); the caller warns
/// and falls back to square corners.
fn sane(r: f64) -> bool {
    r.is_finite() && r >= 0.0
}

/// Resolves `radius` against a `w × h` border box, per axis. Returns
/// `None` when the authored value is unusable, so the caller can warn
/// once with the offending number.
pub(super) fn resolve_corners(radius: &Length, w: f64, h: f64, basis: &Basis) -> Option<Corners> {
    let (rx, ry) = match radius {
        // The one two-basis case: CSS resolves each axis against its own
        // side, so a `%` radius is elliptical on a non-square box.
        Length::Percent(p) => (p / 100.0 * w, p / 100.0 * h),
        other => {
            let r = other.resolve(w, basis.font);
            (r, r)
        }
    };
    (sane(rx) && sane(ry)).then_some(Corners { rx, ry })
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// The corner radii for a `w × h` border box under `computed`, already
    /// clamped to the box (CSS shrinks an oversized radius rather than
    /// rejecting it). Unset or unusable values give square corners; an
    /// unusable one warns `invalid_border_radius` naming the authored
    /// length, since silently squaring a corner the author asked for is
    /// the kind of no-op that reads as an engine bug.
    pub(super) fn corner_radius(
        &mut self,
        computed: &ComputedStyle,
        w: f64,
        h: f64,
        basis: &Basis,
    ) -> Corners {
        let Some(radius) = computed.border_radius.as_ref() else {
            return Corners::default();
        };
        match resolve_corners(radius, w, h, basis) {
            Some(corners) => corners.clamped(w, h),
            None => {
                self.diags.push(
                    Diagnostic::new(Code::InvalidBorderRadius)
                        .arg("value", format!("{radius:?}"))
                        .arg("fallback", "square corners"),
                );
                Corners::default()
            }
        }
    }

    /// Reports a `borderRadius` that the drawing context cannot honor —
    /// a per-side or `double` border, a `table`, or a form mark — so the
    /// square corners the author sees are explained rather than silent.
    /// `context` names which of those it was.
    pub(in crate::engine) fn warn_radius_ignored(
        &mut self,
        computed: &ComputedStyle,
        context: &'static str,
    ) {
        if computed.border_radius.is_some() {
            self.diags
                .push(Diagnostic::new(Code::BorderRadiusIgnored).arg("context", context));
        }
    }
}

#[cfg(test)]
mod tests;
