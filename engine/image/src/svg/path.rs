//! Path-data parsing (`d=`) into transformed cubic commands: smooth
//! shorthands, quadratic elevation, and arc flattening.

use crate::geom::PathCmd;
use kurbo::{Arc, Point, SvgArc, Vec2};
use svgtypes::{PathParser, PathSegment};

use super::style::Affine;
use super::Warnings;

/// Emits transformed commands (shape math happens in local coordinates;
/// points pass through the CTM exactly once, here).
pub(super) struct PathSink<'a> {
    ctm: &'a Affine,
    pub(super) cmds: Vec<PathCmd>,
}

impl<'a> PathSink<'a> {
    pub(super) fn new(ctm: &'a Affine) -> Self {
        Self {
            ctm,
            cmds: Vec::new(),
        }
    }

    pub(super) fn move_to(&mut self, p: (f64, f64)) {
        let (x, y) = self.ctm.apply(p.0, p.1);
        self.cmds.push(PathCmd::MoveTo(x, y));
    }

    pub(super) fn line_to(&mut self, p: (f64, f64)) {
        let (x, y) = self.ctm.apply(p.0, p.1);
        self.cmds.push(PathCmd::LineTo(x, y));
    }

    pub(super) fn curve_to(&mut self, p1: (f64, f64), p2: (f64, f64), p: (f64, f64)) {
        let (x1, y1) = self.ctm.apply(p1.0, p1.1);
        let (x2, y2) = self.ctm.apply(p2.0, p2.1);
        let (x, y) = self.ctm.apply(p.0, p.1);
        self.cmds.push(PathCmd::CurveTo(x1, y1, x2, y2, x, y));
    }

    pub(super) fn close(&mut self) {
        self.cmds.push(PathCmd::Close);
    }
}

/// Normalizes SVG path data into absolute move/line/cubic commands.
///
/// Quadratics become cubics, `H`/`V` become lines, smooth variants get
/// their reflected control points, and arcs are converted via kurbo.
/// Invalid or non-finite data truncates the path with a warning instead
/// of failing the whole document.
pub(super) fn parse_path_data(d: &str, ctm: &Affine, warnings: &mut Warnings) -> Vec<PathCmd> {
    let mut sink = PathSink::new(ctm);
    let mut cur = (0.0_f64, 0.0_f64);
    let mut subpath_start = cur;
    let mut prev_cubic_ctrl: Option<(f64, f64)> = None;
    let mut prev_quad_ctrl: Option<(f64, f64)> = None;

    for segment in PathParser::from(d) {
        let Ok(segment) = segment else {
            warnings.push("invalid path data truncated");
            break;
        };
        let mut next_cubic_ctrl = None;
        let mut next_quad_ctrl = None;
        match segment {
            PathSegment::MoveTo { abs, x, y } => {
                cur = absolute(abs, (x, y), cur);
                subpath_start = cur;
                sink.move_to(cur);
            }
            PathSegment::LineTo { abs, x, y } => {
                cur = absolute(abs, (x, y), cur);
                sink.line_to(cur);
            }
            PathSegment::HorizontalLineTo { abs, x } => {
                cur = (if abs { x } else { cur.0 + x }, cur.1);
                sink.line_to(cur);
            }
            PathSegment::VerticalLineTo { abs, y } => {
                cur = (cur.0, if abs { y } else { cur.1 + y });
                sink.line_to(cur);
            }
            PathSegment::CurveTo {
                abs,
                x1,
                y1,
                x2,
                y2,
                x,
                y,
            } => {
                let p1 = absolute(abs, (x1, y1), cur);
                let p2 = absolute(abs, (x2, y2), cur);
                cur = absolute(abs, (x, y), cur);
                sink.curve_to(p1, p2, cur);
                next_cubic_ctrl = Some(p2);
            }
            PathSegment::SmoothCurveTo { abs, x2, y2, x, y } => {
                let p1 = reflect(prev_cubic_ctrl, cur);
                let p2 = absolute(abs, (x2, y2), cur);
                cur = absolute(abs, (x, y), cur);
                sink.curve_to(p1, p2, cur);
                next_cubic_ctrl = Some(p2);
            }
            PathSegment::Quadratic { abs, x1, y1, x, y } => {
                let q = absolute(abs, (x1, y1), cur);
                let end = absolute(abs, (x, y), cur);
                quad_to_cubic(&mut sink, cur, q, end);
                cur = end;
                next_quad_ctrl = Some(q);
            }
            PathSegment::SmoothQuadratic { abs, x, y } => {
                let q = reflect(prev_quad_ctrl, cur);
                let end = absolute(abs, (x, y), cur);
                quad_to_cubic(&mut sink, cur, q, end);
                cur = end;
                next_quad_ctrl = Some(q);
            }
            PathSegment::EllipticalArc {
                abs,
                rx,
                ry,
                x_axis_rotation,
                large_arc,
                sweep,
                x,
                y,
            } => {
                let to = absolute(abs, (x, y), cur);
                arc_to_cubics(
                    &mut sink,
                    cur,
                    to,
                    rx,
                    ry,
                    x_axis_rotation,
                    large_arc,
                    sweep,
                );
                cur = to;
            }
            PathSegment::ClosePath { .. } => {
                sink.close();
                cur = subpath_start;
            }
        }
        if !(cur.0.is_finite() && cur.1.is_finite()) {
            warnings.push("non-finite path coordinate truncated");
            break;
        }
        prev_cubic_ctrl = next_cubic_ctrl;
        prev_quad_ctrl = next_quad_ctrl;
    }
    sink.cmds
}

/// Absolute endpoint for a possibly-relative coordinate pair.
fn absolute(abs: bool, p: (f64, f64), cur: (f64, f64)) -> (f64, f64) {
    if abs {
        p
    } else {
        (cur.0 + p.0, cur.1 + p.1)
    }
}

/// Reflection of the previous control point around the current point
/// (the `S`/`T` rule); falls back to the current point.
fn reflect(prev: Option<(f64, f64)>, cur: (f64, f64)) -> (f64, f64) {
    match prev {
        Some((px, py)) => (2.0 * cur.0 - px, 2.0 * cur.1 - py),
        None => cur,
    }
}

/// Exact quadratic -> cubic control-point elevation.
fn quad_to_cubic(sink: &mut PathSink, from: (f64, f64), q: (f64, f64), to: (f64, f64)) {
    let c1 = (
        from.0 + 2.0 / 3.0 * (q.0 - from.0),
        from.1 + 2.0 / 3.0 * (q.1 - from.1),
    );
    let c2 = (
        to.0 + 2.0 / 3.0 * (q.0 - to.0),
        to.1 + 2.0 / 3.0 * (q.1 - to.1),
    );
    sink.curve_to(c1, c2, to);
}

/// SVG arc -> cubic Béziers via kurbo. Degenerate arcs (zero radius or
/// coincident endpoints) collapse to a line per the SVG spec.
#[allow(clippy::too_many_arguments)] // mirrors the SVG arc parameter list
fn arc_to_cubics(
    sink: &mut PathSink,
    from: (f64, f64),
    to: (f64, f64),
    rx: f64,
    ry: f64,
    x_axis_rotation: f64,
    large_arc: bool,
    sweep: bool,
) {
    let svg_arc = SvgArc {
        from: Point::new(from.0, from.1),
        to: Point::new(to.0, to.1),
        radii: Vec2::new(rx.abs(), ry.abs()),
        x_rotation: x_axis_rotation.to_radians(),
        large_arc,
        sweep,
    };
    match Arc::from_svg_arc(&svg_arc) {
        Some(arc) => arc.to_cubic_beziers(0.1, |p1, p2, p| {
            sink.curve_to((p1.x, p1.y), (p2.x, p2.y), (p.x, p.y));
        }),
        None => sink.line_to(to),
    }
}
