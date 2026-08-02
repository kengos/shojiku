//! SVG paint -> tiny-skia `Paint` conversion: solid colors and
//! linear/radial gradient shaders. Gradient endpoints are in viewBox-local
//! coordinates with a local->viewBox `transform`; tiny-skia post-concats
//! the fill transform onto it, so the same viewBox->px matrix used for the
//! path lands the gradient in the right place (matching the PDF backend).

use shojiku_image::{
    GradientStop, GradientTransform, LinearGradient, RadialGradient, SpreadMode, SvgPaint,
};
use tiny_skia::{
    Color, GradientStop as TsStop, LinearGradient as TsLinear, Paint, Point,
    RadialGradient as TsRadial, Shader, SpreadMode as TsSpread, Transform,
};

use super::rgb;

/// Builds a tiny-skia paint for a resolved SVG path fill. `None` when a
/// gradient is degenerate (tiny-skia rejects zero-length / non-invertible),
/// so the caller skips the fill.
pub(crate) fn svg_paint(paint: &SvgPaint) -> Option<Paint<'static>> {
    let shader = match paint {
        SvgPaint::Solid(color) => Shader::SolidColor(rgb(*color)),
        SvgPaint::Linear(g) => linear(g)?,
        SvgPaint::Radial(g) => radial(g)?,
    };
    // `Paint::default()` already enables anti-aliasing.
    Some(Paint {
        shader,
        ..Default::default()
    })
}

fn linear(g: &LinearGradient) -> Option<Shader<'static>> {
    TsLinear::new(
        Point::from_xy(g.x1 as f32, g.y1 as f32),
        Point::from_xy(g.x2 as f32, g.y2 as f32),
        stops(&g.stops),
        spread(g.spread),
        transform(&g.transform),
    )
}

fn radial(g: &RadialGradient) -> Option<Shader<'static>> {
    TsRadial::new(
        Point::from_xy(g.fx as f32, g.fy as f32),
        g.fr as f32,
        Point::from_xy(g.cx as f32, g.cy as f32),
        g.cr as f32,
        stops(&g.stops),
        spread(g.spread),
        transform(&g.transform),
    )
}

fn stops(src: &[GradientStop]) -> Vec<TsStop> {
    src.iter()
        .map(|s| {
            let (r, g, b) = s.color;
            let color = Color::from_rgba(
                r.clamp(0.0, 1.0),
                g.clamp(0.0, 1.0),
                b.clamp(0.0, 1.0),
                s.opacity.clamp(0.0, 1.0),
            )
            .unwrap_or(Color::BLACK);
            TsStop::new(s.offset.clamp(0.0, 1.0), color)
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

fn spread(mode: SpreadMode) -> TsSpread {
    match mode {
        SpreadMode::Pad => TsSpread::Pad,
        SpreadMode::Reflect => TsSpread::Reflect,
        SpreadMode::Repeat => TsSpread::Repeat,
    }
}
