//! The coordinate range of a parsed SVG: the limits on the viewBox, and
//! the range every emitted path coordinate, stroke width and gradient
//! number is held to.
//!
//! The range is sized from the viewBox, per axis, so that after layout's
//! viewBox -> box scale every number a renderer computes in `f32` (the
//! scale itself, path bounds, stroke outlines, gradient products) stays
//! finite. Per axis because `fit: stretch` scales x and y by different
//! factors: a bound of `RANGE_RATIO` viewBox widths in x and heights in y
//! is at most `RANGE_RATIO` times the drawn box in both directions,
//! whatever the viewBox aspect ratio.
//!
//! Geometry past the range is not drawn, with a warning; nothing is moved
//! or reduced, so whatever is drawn is drawn as authored. Every SVG is
//! clipped to its viewBox, so a path lying wholly past the range was
//! invisible anyway; only a path that crosses the viewBox and also reaches
//! past 1000 viewBox sizes has a visible part left undrawn.

use crate::error::ImageError;

/// Smallest accepted viewBox width or height. With layout's 1,000,000 pt
/// cap on a drawn image, the viewBox -> box scale stays at most `1e9`.
pub(super) const VIEWBOX_MIN: f64 = 1e-3;

/// Largest accepted viewBox width or height. `fit: none` draws one viewBox
/// unit as one pt, so this equals layout's cap on a resolved length.
pub(super) const VIEWBOX_MAX: f64 = 1e6;

/// Largest accepted distance of the viewBox origin from zero. The parser
/// subtracts the origin in `f64` before anything reaches a renderer, so
/// this bound only keeps the rounding error of that subtraction (at most
/// about 1.2e-7) well under `VIEWBOX_MIN`; it admits map exports in
/// projected coordinates
/// (`viewBox="500000 4100000 1000 1000"`).
pub(super) const ORIGIN_MAX: f64 = 1e9;

/// How many viewBox widths (in x) or heights (in y) a coordinate may lie
/// from the viewBox origin.
pub(super) const RANGE_RATIO: f64 = 1_000.0;

/// The warning for a path not drawn because a coordinate is past the range.
pub(super) const OUT_OF_RANGE: &str = "path with a coordinate more than 1000 viewBox widths or \
                                       heights from the viewBox origin not drawn";

/// The warning for a path not drawn because a coordinate is not finite.
pub(super) const NON_FINITE: &str = "path with a non-finite coordinate not drawn";

/// The warning for a gradient not used because a number is past the
/// gradient limit.
pub(super) const GRADIENT_DROPPED: &str = "gradient with a coordinate, radius or transform entry \
                                           more than 2000 times the viewBox's larger side from \
                                           zero not used";

/// The warning for a stroke not drawn because its width is past the range.
pub(super) const STROKE_DROPPED: &str =
    "stroke wider than 1000 times the viewBox's smaller side not drawn";

/// Refuses a viewBox (or `width`/`height` size) outside the accepted
/// limits: a width or height outside `VIEWBOX_MIN..=VIEWBOX_MAX`, or an
/// origin coordinate farther than `ORIGIN_MAX` from zero.
pub(super) fn check_viewbox(min_x: f64, min_y: f64, w: f64, h: f64) -> Result<(), ImageError> {
    let size_ok = |v: f64| (VIEWBOX_MIN..=VIEWBOX_MAX).contains(&v);
    let origin_ok = |v: f64| v.abs() <= ORIGIN_MAX;
    if size_ok(w) && size_ok(h) && origin_ok(min_x) && origin_ok(min_y) {
        return Ok(());
    }
    Err(ImageError::Svg(format!(
        "viewBox {min_x} {min_y} {w} {h} is outside the supported range \
         (width and height from {VIEWBOX_MIN} to {VIEWBOX_MAX}, origin within ±{ORIGIN_MAX})"
    )))
}

/// Why a path is not drawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Refusal {
    /// A coordinate is farther from the viewBox origin than the range.
    OutOfRange,
    /// A coordinate is infinite or NaN.
    NonFinite,
}

impl Refusal {
    /// The warning that names this refusal.
    pub(super) fn warning(self) -> &'static str {
        match self {
            Refusal::OutOfRange => OUT_OF_RANGE,
            Refusal::NonFinite => NON_FINITE,
        }
    }
}

/// The range of one SVG, built from its validated viewBox size.
#[derive(Debug, Clone, Copy)]
pub(super) struct Bound {
    /// Largest `|x|` of an emitted coordinate.
    x: f64,
    /// Largest `|y|` of an emitted coordinate.
    y: f64,
}

impl Bound {
    /// The range for a viewBox of `(width, height)`, with the origin at 0
    /// (the parser translates the viewBox origin there).
    pub(super) fn new((w, h): (f64, f64)) -> Self {
        Self {
            x: RANGE_RATIO * w,
            y: RANGE_RATIO * h,
        }
    }

    /// `Ok` when `(x, y)` may be emitted; otherwise why the path holding
    /// it is not drawn. A point exactly on the edge of the range is kept.
    pub(super) fn check(&self, (x, y): (f64, f64)) -> Result<(), Refusal> {
        if !(x.is_finite() && y.is_finite()) {
            return Err(Refusal::NonFinite);
        }
        if x.abs() <= self.x && y.abs() <= self.y {
            Ok(())
        } else {
            Err(Refusal::OutOfRange)
        }
    }

    /// The largest stroke width: `RANGE_RATIO` times the smaller viewBox
    /// side, so the stroke width after the viewBox -> box scale is at most
    /// `RANGE_RATIO` times the drawn image's larger side.
    pub(super) fn stroke_limit(&self) -> f64 {
        self.x.min(self.y)
    }

    /// The largest `|value|` of a gradient number (a local point, a radius,
    /// or an entry of the local -> viewBox affine): twice the larger range,
    /// because an `objectBoundingBox` gradient composes the bounding box of
    /// its path, up to twice the range wide, into its local -> viewBox
    /// affine.
    pub(super) fn gradient_limit(&self) -> f64 {
        2.0 * self.x.max(self.y)
    }
}

#[cfg(test)]
mod tests;
