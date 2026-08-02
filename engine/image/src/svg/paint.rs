//! SVG paint: a resolved solid color or gradient. Gradients keep their
//! stop geometry in a local coordinate space plus a `transform` mapping
//! that space into viewBox coordinates, so the renderers hand the affine
//! straight to their gradient backend and reuse the same viewBox->box
//! scale they already apply to the flattened paths.

/// Upper bound on gradient stops kept, so hostile markup cannot make stop
/// vectors grow without limit (each stop is also an element bounded by
/// [`super::SvgLimits::max_nodes`], but the cap keeps a single gradient
/// cheap regardless).
pub(crate) const MAX_GRADIENT_STOPS: usize = 256;

/// How a gradient repeats outside its `[0, 1]` span.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpreadMode {
    /// Clamp to the first/last stop (SVG default).
    Pad,
    /// Mirror the gradient on each repeat.
    Reflect,
    /// Tile the gradient on each repeat.
    Repeat,
}

/// One gradient color stop. `offset` is clamped to `0..=1` and stops are
/// sorted non-decreasing during resolution; `color` and `opacity` are
/// `0..=1`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GradientStop {
    /// Position along the gradient, `0..=1`.
    pub offset: f32,
    /// Stop color as `0..=1` RGB.
    pub color: (f32, f32, f32),
    /// Stop alpha, `0..=1` (from `stop-opacity`).
    pub opacity: f32,
}

/// A gradient's local->viewBox affine (`a b c d e f`, SVG column-major).
/// The renderer applies it as the backend gradient transform.
pub type GradientTransform = [f64; 6];

/// A linear gradient expressed in its local coordinate space.
#[derive(Debug, Clone, PartialEq)]
pub struct LinearGradient {
    /// Start point x.
    pub x1: f64,
    /// Start point y.
    pub y1: f64,
    /// End point x.
    pub x2: f64,
    /// End point y.
    pub y2: f64,
    /// Local-space -> viewBox affine.
    pub transform: GradientTransform,
    /// Spread beyond `[0, 1]`.
    pub spread: SpreadMode,
    /// Color stops, normalized (offsets clamped/sorted).
    pub stops: Vec<GradientStop>,
}

/// A radial gradient: focal circle `(fx, fy, fr)` to end circle
/// `(cx, cy, cr)`, in local coordinates.
#[derive(Debug, Clone, PartialEq)]
pub struct RadialGradient {
    /// Focal circle center x.
    pub fx: f64,
    /// Focal circle center y.
    pub fy: f64,
    /// Focal circle radius (0 for a standard focal point).
    pub fr: f64,
    /// End circle center x.
    pub cx: f64,
    /// End circle center y.
    pub cy: f64,
    /// End circle radius.
    pub cr: f64,
    /// Local-space -> viewBox affine.
    pub transform: GradientTransform,
    /// Spread beyond `[0, 1]`.
    pub spread: SpreadMode,
    /// Color stops, normalized (offsets clamped/sorted).
    pub stops: Vec<GradientStop>,
}

/// A resolved fill paint: a flat color or a gradient.
#[derive(Debug, Clone, PartialEq)]
pub enum SvgPaint {
    /// Flat `0..=1` RGB.
    Solid((f32, f32, f32)),
    /// Linear gradient.
    Linear(LinearGradient),
    /// Radial gradient.
    Radial(RadialGradient),
}

/// Clamps offsets/opacity to `0..=1`, forces offsets non-decreasing, and
/// caps the count. Returns `None` when no usable stop remains (an empty
/// gradient is skipped by the caller, like a `fill: none`).
pub(crate) fn normalize_stops(mut stops: Vec<GradientStop>) -> Option<Vec<GradientStop>> {
    stops.truncate(MAX_GRADIENT_STOPS);
    let mut prev = 0.0_f32;
    for stop in &mut stops {
        // SVG requires each offset >= the previous; `.max(prev)` enforces
        // that and also folds a non-finite offset back to `prev` (NaN loses
        // to the finite operand), so the backends never see a bad run.
        stop.offset = stop.offset.clamp(0.0, 1.0).max(prev);
        prev = stop.offset;
        stop.opacity = clamp01(stop.opacity);
        stop.color = (
            clamp01(stop.color.0),
            clamp01(stop.color.1),
            clamp01(stop.color.2),
        );
    }
    (!stops.is_empty()).then_some(stops)
}

/// Clamps a channel/alpha to `0..=1`, mapping non-finite to 0.
fn clamp01(v: f32) -> f32 {
    if v.is_finite() {
        v.clamp(0.0, 1.0)
    } else {
        0.0
    }
}
