//! Unit tests for the SVG subset parser; shared parse helper here.

mod gradient_guards;
mod gradients;
mod paths;
mod shapes;

use super::*;

pub(super) fn parse(text: &str) -> SvgTree {
    parse_svg(text, &SvgLimits::default()).expect("parse")
}

/// The solid fill color of a path, or `None` for no/gradient fill.
pub(super) fn solid_fill(path: &SvgPath) -> Option<(f32, f32, f32)> {
    match &path.fill {
        Some(SvgPaint::Solid(color)) => Some(*color),
        _ => None,
    }
}

/// The linear gradient fill of a path (panics otherwise).
pub(super) fn linear(path: &SvgPath) -> &LinearGradient {
    match &path.fill {
        Some(SvgPaint::Linear(g)) => g,
        other => panic!("expected linear gradient, got {other:?}"),
    }
}

/// The radial gradient fill of a path (panics otherwise).
pub(super) fn radial(path: &SvgPath) -> &RadialGradient {
    match &path.fill {
        Some(SvgPaint::Radial(g)) => g,
        other => panic!("expected radial gradient, got {other:?}"),
    }
}

/// Approximate f64 equality for resolved coordinate assertions.
pub(super) fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-6
}
