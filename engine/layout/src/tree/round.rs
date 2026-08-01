//! Rounded-corner + dash vocabulary for the tree's stroked primitives,
//! and the one rounded-rectangle path builder both renderers replay.
//!
//! Layout owns the geometry (the repo's layout-decides/renderers-execute
//! split): a `borderRadius` becomes concrete [`Corners`] in pt here, and
//! the renderers either hand the radii to a native rounded-rect call or
//! play [`rounded_rect_cmds`] back through their existing [`PathCmd`]
//! machinery. Dash intervals are likewise resolved to pt by layout so
//! neither backend re-derives a pattern from the style.

use super::PathCmd;
use serde::Serialize;

/// Control-point ratio for approximating a quarter ellipse with one cubic
/// (the standard circle-to-Bézier constant, 4/3·(√2−1)).
const KAPPA: f64 = 0.552_284_749_830_793_6;

/// Corner radii of a box in pt, horizontal and vertical. They differ only
/// for a `%` radius on a non-square box (CSS resolves the two axes
/// independently), so `rx == ry` is the common case. `(0, 0)` = square
/// corners, the initial value.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
pub struct Corners {
    pub rx: f64,
    pub ry: f64,
}

impl Corners {
    /// Equal radii on both axes — every non-`%` length resolves this way.
    pub fn uniform(r: f64) -> Self {
        Corners { rx: r, ry: r }
    }

    /// Whether the corners are square (nothing to round). Both the
    /// serialization skip and the renderers' fast paths key off this.
    pub fn is_square(&self) -> bool {
        self.rx <= 0.0 || self.ry <= 0.0
    }

    /// Shrinks the radii to fit the box, by the CSS "overlapping curves"
    /// rule (CSS Backgrounds and Borders §5.5): compute `f`, the smallest
    /// ratio of a side's length to the sum of the two radii along it, and
    /// if `f < 1` scale **both** axes by it.
    ///
    /// Scaling uniformly rather than clamping each axis on its own is
    /// what makes an absolute radius larger than the box read as a
    /// stadium (a "pill"): on a 130×30 box, `999` becomes `15, 15` — the
    /// short side's half — not `65, 15`, which would be a full ellipse.
    /// A `50%` radius is already exactly half of each side, so `f` is 1
    /// and the ellipse it asks for survives untouched.
    ///
    /// Non-finite or non-positive input collapses to square corners (the
    /// caller warns); this stays total so hostile geometry cannot escape.
    pub fn clamped(self, w: f64, h: f64) -> Self {
        let usable = |r: f64| r.is_finite() && r > 0.0;
        if !(usable(self.rx) && usable(self.ry) && usable(w) && usable(h)) {
            return Corners::default();
        }
        // Each side is shared by two corners of equal radius here, hence
        // the doubled denominators. `f > 1` means the radii already fit.
        let f = (w / (2.0 * self.rx)).min(h / (2.0 * self.ry)).min(1.0);
        Corners {
            rx: self.rx * f,
            ry: self.ry * f,
        }
    }
}

/// One repeat of a dash pattern in pt: `on` painted, `off` skipped.
/// Layout derives both from the stroke width, so the renderers only pass
/// them to their dashing API.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Dash {
    pub on: f64,
    pub off: f64,
}

/// The rounded rectangle at `(x, y, w, h)` with corner radii `corners`,
/// as a closed path drawn clockwise from the top edge. The radii are
/// clamped to the box first, so a caller cannot produce self-crossing
/// geometry. A square (or degenerate) box yields the plain four-line
/// rectangle, which keeps the renderers' path playback uniform.
pub fn rounded_rect_cmds(x: f64, y: f64, w: f64, h: f64, corners: Corners) -> Vec<PathCmd> {
    let Corners { rx, ry } = corners.clamped(w, h);
    if rx <= 0.0 || ry <= 0.0 {
        return vec![
            PathCmd::MoveTo(x, y),
            PathCmd::LineTo(x + w, y),
            PathCmd::LineTo(x + w, y + h),
            PathCmd::LineTo(x, y + h),
            PathCmd::Close,
        ];
    }
    let (cx, cy) = (rx * KAPPA, ry * KAPPA);
    let (r, b) = (x + w, y + h);
    vec![
        PathCmd::MoveTo(x + rx, y),
        PathCmd::LineTo(r - rx, y),
        PathCmd::CurveTo(r - rx + cx, y, r, y + ry - cy, r, y + ry),
        PathCmd::LineTo(r, b - ry),
        PathCmd::CurveTo(r, b - ry + cy, r - rx + cx, b, r - rx, b),
        PathCmd::LineTo(x + rx, b),
        PathCmd::CurveTo(x + rx - cx, b, x, b - ry + cy, x, b - ry),
        PathCmd::LineTo(x, y + ry),
        PathCmd::CurveTo(x, y + ry - cy, x + rx - cx, y, x + rx, y),
        PathCmd::Close,
    ]
}

#[cfg(test)]
mod tests;
