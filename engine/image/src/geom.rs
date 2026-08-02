//! Backend-neutral vector-path primitive shared by SVG assets, font
//! glyph outlines, and both renderers (the drawing currency of the
//! layout tree).

use serde::Serialize;

/// One drawing command, in viewBox coordinates.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum PathCmd {
    /// Start a new subpath at (x, y).
    MoveTo(f64, f64),
    /// Straight segment to (x, y).
    LineTo(f64, f64),
    /// Cubic Bézier: control 1, control 2, endpoint.
    CurveTo(f64, f64, f64, f64, f64, f64),
    /// Close the current subpath.
    Close,
}
