//! SVG paint -> krilla fill conversion: solid colors and linear/radial
//! gradients. Gradient geometry is already in viewBox coordinates with a
//! local->viewBox `transform`; the caller's viewBox->box surface transform
//! scales it into the target box, matching the paths.

use krilla::geom::Transform;
use krilla::num::NormalizedF32;
use krilla::paint::{Fill, LinearGradient, RadialGradient, SpreadMethod, Stop};
use shojiku_image::{GradientStop, GradientTransform, SpreadMode, SvgPaint};

use crate::draw::{rgb_color, solid_fill};

/// Builds a krilla fill for a resolved SVG path paint.
pub(crate) fn svg_fill(paint: &SvgPaint) -> Fill {
    match paint {
        SvgPaint::Solid(color) => solid_fill(*color, 1.0),
        SvgPaint::Linear(g) => gradient_fill(
            LinearGradient {
                x1: g.x1 as f32,
                y1: g.y1 as f32,
                x2: g.x2 as f32,
                y2: g.y2 as f32,
                transform: transform(&g.transform),
                spread_method: spread(g.spread),
                stops: stops(&g.stops),
                anti_alias: true,
            }
            .into(),
        ),
        SvgPaint::Radial(g) => gradient_fill(
            RadialGradient {
                fx: g.fx as f32,
                fy: g.fy as f32,
                fr: g.fr as f32,
                cx: g.cx as f32,
                cy: g.cy as f32,
                cr: g.cr as f32,
                transform: transform(&g.transform),
                spread_method: spread(g.spread),
                stops: stops(&g.stops),
                anti_alias: true,
            }
            .into(),
        ),
    }
}

/// Wraps a gradient paint in an opaque, non-zero-rule fill.
fn gradient_fill(paint: krilla::paint::Paint) -> Fill {
    Fill {
        paint,
        opacity: NormalizedF32::ONE,
        rule: Default::default(),
    }
}

fn stops(src: &[GradientStop]) -> Vec<Stop> {
    src.iter()
        .map(|s| Stop {
            offset: norm(s.offset),
            color: rgb_color(s.color).into(),
            opacity: norm(s.opacity),
        })
        .collect()
}

fn transform(t: &GradientTransform) -> Transform {
    Transform::from_row(
        t[0] as f32,
        t[1] as f32,
        t[2] as f32,
        t[3] as f32,
        t[4] as f32,
        t[5] as f32,
    )
}

fn spread(mode: SpreadMode) -> SpreadMethod {
    match mode {
        SpreadMode::Pad => SpreadMethod::Pad,
        SpreadMode::Reflect => SpreadMethod::Reflect,
        SpreadMode::Repeat => SpreadMethod::Repeat,
    }
}

/// Stops are normalized to `0..=1` at parse time; guard anyway so a stray
/// non-finite can never panic `NormalizedF32::new`.
fn norm(v: f32) -> NormalizedF32 {
    NormalizedF32::new(v.clamp(0.0, 1.0)).unwrap_or(NormalizedF32::ZERO)
}
