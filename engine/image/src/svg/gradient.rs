//! `<linearGradient>` / `<radialGradient>` support: collect gradient
//! definitions from the document, then resolve a `url(#id)` fill against
//! a path's bounding box into a backend-neutral [`SvgPaint`]. Coordinates
//! resolve to a local space (unit square for `objectBoundingBox`, user
//! units for `userSpaceOnUse`) paired with a `local -> viewBox` affine, so
//! the renderers reuse the same viewBox->box scale they apply to paths.

use std::collections::{HashMap, HashSet};

use super::Warnings;
use super::bound::{Bound, GRADIENT_DROPPED};
use super::paint::{
    GradientStop, LinearGradient, RadialGradient, SpreadMode, SvgPaint, normalize_stops,
};
use super::style::Affine;

mod parse;

/// Longest `href` chain followed while inheriting stops/attributes.
const MAX_HREF_HOPS: usize = 8;

/// Gradient definitions keyed by `id`.
pub(super) type GradientMap = HashMap<String, GradientDef>;

/// A gradient coordinate: a plain number or a percentage (kept as a
/// `0..=1` fraction) — the two resolve differently under `userSpaceOnUse`.
#[derive(Debug, Clone, Copy)]
pub(super) enum Coord {
    Num(f64),
    Pct(f64),
}

/// The gradient coordinate system.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Units {
    /// Coordinates are user-space values (`%` is of the viewBox).
    User,
    /// Coordinates are fractions of the filled path's bounding box.
    Bbox,
}

/// Kind-specific geometry, each coordinate optional (defaulted at resolve).
#[derive(Debug, Clone)]
pub(super) enum Kind {
    Linear {
        x1: Option<Coord>,
        y1: Option<Coord>,
        x2: Option<Coord>,
        y2: Option<Coord>,
    },
    Radial {
        cx: Option<Coord>,
        cy: Option<Coord>,
        r: Option<Coord>,
        fx: Option<Coord>,
        fy: Option<Coord>,
    },
}

/// A parsed gradient definition (before ref-resolution against a path).
#[derive(Debug, Clone)]
pub(super) struct GradientDef {
    pub(super) kind: Kind,
    pub(super) units: Units,
    pub(super) transform: Affine,
    pub(super) spread: SpreadMode,
    pub(super) stops: Vec<GradientStop>,
    pub(super) href: Option<String>,
}

/// Collects every `id`-bearing gradient definition in the document.
pub(super) fn collect(doc: &roxmltree::Document, warnings: &mut Warnings) -> GradientMap {
    let mut map = GradientMap::new();
    for node in doc.descendants().filter(roxmltree::Node::is_element) {
        if matches!(node.tag_name().name(), "linearGradient" | "radialGradient")
            && let Some((id, def)) = parse::parse_def(&node, warnings)
        {
            map.insert(id, def);
        }
    }
    map
}

/// Resolves a `url(#id)` fill against the filled path's `bbox`
/// (`(min_x, min_y, w, h)` in viewBox coords, `None` when degenerate) and
/// the document `view` size. `None` = nothing to paint.
pub(super) fn resolve(
    map: &GradientMap,
    id: &str,
    ctm: &Affine,
    bbox: Option<(f64, f64, f64, f64)>,
    view: (f64, f64),
    bound: Bound,
    warnings: &mut Warnings,
) -> Option<SvgPaint> {
    let eff = effective(map, id, warnings)?;
    let (transform, dims) = space(&eff, ctm, bbox, view, warnings)?;
    let stops = normalize_stops(eff.stops)?;
    let row = transform.to_row();
    let limit = bound.gradient_limit();
    let assemble = |frame| {
        build(
            &eff.kind,
            eff.units,
            frame,
            eff.spread,
            stops.clone(),
            dims,
            limit,
        )
    };
    // The rebased geometry first; when a small linear part makes the
    // rebased points large, the geometry as authored may still fit.
    let paint = assemble(rebase(eff.units, row)).or_else(|| assemble((row, (0.0, 0.0))));
    if paint.is_none() {
        warnings.push(GRADIENT_DROPPED);
    }
    paint
}

/// Whether the local->viewBox affine and every local point and radius of
/// a gradient are finite and at most `limit` from zero
/// ([`Bound::gradient_limit`]).
fn within(points: &[f64], transform: &[f64; 6], limit: f64) -> bool {
    points
        .iter()
        .chain(transform)
        .all(|&v| v.is_finite() && v.abs() <= limit)
}

/// A gradient with `href`-inherited stops folded in.
struct Effective {
    kind: Kind,
    units: Units,
    transform: Affine,
    spread: SpreadMode,
    stops: Vec<GradientStop>,
}

/// Folds the `href` chain: geometry/units/transform/spread come from the
/// entry def; stops are inherited from the first def down the chain that
/// has any (the common Inkscape/Illustrator stop-holder pattern). Cycles
/// and over-long chains warn and stop. Coordinate inheritance is not
/// modeled (the referencing gradient carries its own geometry in practice).
fn effective(map: &GradientMap, id: &str, warnings: &mut Warnings) -> Option<Effective> {
    let Some(head) = map.get(id) else {
        warnings.push(&format!("unknown gradient `#{id}` ignored"));
        return None;
    };
    let mut stops = head.stops.clone();
    let mut visited: HashSet<&str> = HashSet::from([id]);
    let mut cur = head;
    let mut hops = 0;
    while stops.is_empty() {
        let Some(href) = cur.href.as_deref() else { break };
        if !visited.insert(href) {
            warnings.push("gradient href cycle ignored");
            break;
        }
        if hops >= MAX_HREF_HOPS {
            warnings.push("gradient href chain too deep");
            break;
        }
        let Some(next) = map.get(href) else { break };
        stops = next.stops.clone();
        cur = next;
        hops += 1;
    }
    Some(Effective {
        kind: head.kind.clone(),
        units: head.units,
        transform: head.transform,
        spread: head.spread,
        stops,
    })
}

/// The local->viewBox affine and the per-axis dims used to resolve
/// coordinates. `None` when an `objectBoundingBox` gradient has no usable
/// box.
fn space(
    eff: &Effective,
    ctm: &Affine,
    bbox: Option<(f64, f64, f64, f64)>,
    view: (f64, f64),
    warnings: &mut Warnings,
) -> Option<(Affine, (f64, f64))> {
    match eff.units {
        Units::User => Some((ctm.then(&eff.transform), view)),
        Units::Bbox => {
            let (mx, my, w, h) = bbox
                .filter(|&(_, _, w, h)| w > 0.0 && h > 0.0)
                .or_else(|| {
                    warnings.push("gradient on an empty shape ignored");
                    None
                })?;
            let bbox_map = Affine::from_row(w, 0.0, 0.0, h, mx, my);
            // Unit-square coordinates; gradientTransform applies in that space.
            Some((bbox_map.then(&eff.transform), (1.0, 1.0)))
        }
    }
}

/// Assembles the final [`SvgPaint`] from folded geometry + normalized
/// stops; `None` when that geometry is not [`within`] `limit`. `frame` is
/// the local -> viewBox affine and the shift added to every local point
/// (see [`rebase`]).
fn build(
    kind: &Kind,
    units: Units,
    frame: ([f64; 6], (f64, f64)),
    spread: SpreadMode,
    stops: Vec<GradientStop>,
    dims: (f64, f64),
    limit: f64,
) -> Option<SvgPaint> {
    let (transform, (qx, qy)) = frame;
    let local = |c: Option<Coord>, default: Coord, dim: f64, shift: f64| {
        coord_local(c.unwrap_or(default), units, dim) + shift
    };
    let lx = |c, default| local(c, default, dims.0, qx);
    let ly = |c, default| local(c, default, dims.1, qy);
    match *kind {
        Kind::Linear { x1, y1, x2, y2 } => {
            let g = LinearGradient {
                x1: lx(x1, Coord::Pct(0.0)),
                y1: ly(y1, Coord::Pct(0.0)),
                x2: lx(x2, Coord::Pct(1.0)),
                y2: ly(y2, Coord::Pct(0.0)),
                transform,
                spread,
                stops,
            };
            within(&[g.x1, g.y1, g.x2, g.y2], &g.transform, limit).then_some(SvgPaint::Linear(g))
        }
        Kind::Radial { cx, cy, r, fx, fy } => {
            let cxl = lx(cx, Coord::Pct(0.5));
            let cyl = ly(cy, Coord::Pct(0.5));
            let g = RadialGradient {
                cx: cxl,
                cy: cyl,
                cr: local(r, Coord::Pct(0.5), dims.0, 0.0),
                fx: fx.map_or(cxl, |c| lx(Some(c), c)),
                fy: fy.map_or(cyl, |c| ly(Some(c), c)),
                fr: 0.0,
                transform,
                spread,
                stops,
            };
            within(&[g.cx, g.cy, g.cr, g.fx, g.fy, g.fr], &g.transform, limit)
                .then_some(SvgPaint::Radial(g))
        }
    }
}

/// Moves the translation of a `userSpaceOnUse` gradient's local -> viewBox
/// affine into its local points, computed in `f64`: for the affine
/// `[a c e; b d f]` with linear part `L`, the shift is `q = L⁻¹·(e, f)`, and
/// `L·(p + q) = L·p + (e, f)`, so every point maps where it did. Returns
/// the affine without its translation and `q`.
///
/// The translation of a `userSpaceOnUse` affine carries the viewBox origin
/// (subtracted by the parser) and any group translation, and so do the
/// gradient's own user-unit points; checked separately, both can exceed
/// the gradient limit while the gradient lies inside the viewBox. An
/// `objectBoundingBox` affine is built from already-translated path
/// coordinates, and a singular linear part has no inverse: both are kept
/// as they are.
fn rebase(units: Units, t: [f64; 6]) -> ([f64; 6], (f64, f64)) {
    let [a, b, c, d, e, f] = t;
    let det = a * d - b * c;
    if units == Units::Bbox || !(det.is_finite() && det != 0.0) {
        return (t, (0.0, 0.0));
    }
    let q = ((d * e - c * f) / det, (a * f - b * e) / det);
    ([a, b, c, d, 0.0, 0.0], q)
}

/// Resolves a coordinate to a local value: fractions under `objectBounding-
/// Box`, user units (with `%` of the axis dim) under `userSpaceOnUse`.
fn coord_local(c: Coord, units: Units, dim: f64) -> f64 {
    match (units, c) {
        (Units::Bbox, Coord::Num(n) | Coord::Pct(n)) => n,
        (Units::User, Coord::Num(n)) => n,
        (Units::User, Coord::Pct(p)) => p * dim,
    }
}
