//! Path-data parsing (`d=`) into transformed cubic commands: smooth
//! shorthands, quadratic elevation, and arc flattening.

use crate::geom::PathCmd;
use kurbo::{Arc, Point, SvgArc, Vec2};
use svgtypes::{PathParser, PathSegment};

use super::Warnings;
use super::bound::{Bound, Refusal};
use super::style::Affine;

/// Smallest arc flattening tolerance, in the arc's own units.
const ARC_MIN_TOLERANCE: f64 = 0.1;

/// Arc flattening tolerance as a fraction of the arc's larger radius. kurbo
/// splits a full ellipse into `(1.1163 * radius / tolerance)^(1/6)` cubics,
/// so a tolerance of at least `radius * 1e-6` caps one arc at
/// `ceil((1.1163e6)^(1/6)) = 11` cubics, an error of a millionth of the
/// radius. Below a radius of `ARC_MIN_TOLERANCE / ARC_TOLERANCE_RATIO`
/// (100,000 units) the minimum tolerance applies unchanged.
const ARC_TOLERANCE_RATIO: f64 = 1e-6;

/// Emits transformed commands (shape math happens in local coordinates;
/// points pass through the CTM exactly once, here).
///
/// Every point is checked against the SVG's [`Bound`] after the CTM. The
/// first point the bound refuses sets `refused`, after which nothing more
/// is emitted; the caller then draws none of the path and warns with the
/// refusal's message.
pub(super) struct PathSink<'a> {
    ctm: &'a Affine,
    bound: Bound,
    pub(super) cmds: Vec<PathCmd>,
    pub(super) refused: Option<Refusal>,
}

impl<'a> PathSink<'a> {
    pub(super) fn new(ctm: &'a Affine, bound: Bound) -> Self {
        Self {
            ctm,
            bound,
            cmds: Vec::new(),
            refused: None,
        }
    }

    /// Transforms and checks `points`, then pushes the command `build`
    /// makes from them; a point the bound refuses sets `refused` instead.
    fn push<const N: usize>(&mut self, points: [(f64, f64); N], build: fn([f64; 6]) -> PathCmd) {
        if self.refused.is_some() {
            return;
        }
        let mut coords = [0.0; 6];
        for (i, p) in points.iter().enumerate() {
            let (x, y) = self.ctm.apply(p.0, p.1);
            if let Err(refusal) = self.bound.check((x, y)) {
                self.refused = Some(refusal);
                return;
            }
            coords[2 * i] = x;
            coords[2 * i + 1] = y;
        }
        self.cmds.push(build(coords));
    }

    pub(super) fn move_to(&mut self, p: (f64, f64)) {
        self.push([p], |c| PathCmd::MoveTo(c[0], c[1]));
    }

    pub(super) fn line_to(&mut self, p: (f64, f64)) {
        self.push([p], |c| PathCmd::LineTo(c[0], c[1]));
    }

    pub(super) fn curve_to(&mut self, p1: (f64, f64), p2: (f64, f64), p: (f64, f64)) {
        self.push([p1, p2, p], |c| {
            PathCmd::CurveTo(c[0], c[1], c[2], c[3], c[4], c[5])
        });
    }

    pub(super) fn close(&mut self) {
        self.cmds.push(PathCmd::Close);
    }
}

/// Normalizes SVG path data into absolute move/line/cubic commands.
///
/// Quadratics become cubics, `H`/`V` become lines, smooth variants get
/// their reflected control points, and arcs are converted via kurbo.
/// Invalid data truncates the path with a warning instead of failing the
/// whole document; a point the bound refuses stops parsing and sets the
/// returned sink's `refused`.
pub(super) fn parse_path_data<'a>(
    d: &str,
    ctm: &'a Affine,
    bound: Bound,
    warnings: &mut Warnings,
) -> PathSink<'a> {
    let mut sink = PathSink::new(ctm, bound);
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
        // Every segment that moves the current point hands its end point to
        // the sink (an arc whose end is not finite is refused by its NaN
        // geometry in `arc_to_cubics`), so a non-finite current point always
        // leaves the sink refused.
        if sink.refused.is_some() {
            break;
        }
        prev_cubic_ctrl = next_cubic_ctrl;
        prev_quad_ctrl = next_quad_ctrl;
    }
    sink
}

/// Absolute endpoint for a possibly-relative coordinate pair.
fn absolute(abs: bool, p: (f64, f64), cur: (f64, f64)) -> (f64, f64) {
    if abs { p } else { (cur.0 + p.0, cur.1 + p.1) }
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
///
/// The flattening tolerance scales with the radii kurbo resolved (which it
/// enlarges when the given radii cannot reach the endpoint), so one arc
/// yields at most 11 cubics whatever its size — see
/// [`ARC_TOLERANCE_RATIO`].
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
        Some(arc) => {
            // A radius whose square overflows gives kurbo a NaN centre or
            // sweep, and kurbo then yields no cubic at all: the arc would
            // vanish without a warning, so the path is refused instead.
            let geometry = [
                arc.center.x,
                arc.center.y,
                arc.radii.x,
                arc.radii.y,
                arc.sweep_angle,
            ];
            if !geometry.iter().all(|v| v.is_finite()) {
                sink.refused.get_or_insert(Refusal::NonFinite);
                return;
            }
            let radius = arc.radii.x.max(arc.radii.y);
            let tolerance = (radius * ARC_TOLERANCE_RATIO).max(ARC_MIN_TOLERANCE);
            arc.to_cubic_beziers(tolerance, |p1, p2, p| {
                sink.curve_to((p1.x, p1.y), (p2.x, p2.y), (p.x, p.y));
            });
        }
        None => sink.line_to(to),
    }
}
