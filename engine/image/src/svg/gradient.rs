//! `<linearGradient>` / `<radialGradient>` support: collect gradient
//! definitions from the document, then resolve a `url(#id)` fill against
//! a path's bounding box into a backend-neutral [`SvgPaint`]. Coordinates
//! resolve to a local space (unit square for `objectBoundingBox`, user
//! units for `userSpaceOnUse`) paired with a `local -> viewBox` affine, so
//! the renderers reuse the same viewBox->box scale they apply to paths.

use std::collections::{HashMap, HashSet};

use super::paint::{
    normalize_stops, GradientStop, LinearGradient, RadialGradient, SpreadMode, SvgPaint,
};
use super::style::Affine;
use super::Warnings;

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
        if matches!(node.tag_name().name(), "linearGradient" | "radialGradient") {
            if let Some((id, def)) = parse::parse_def(&node, warnings) {
                map.insert(id, def);
            }
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
    warnings: &mut Warnings,
) -> Option<SvgPaint> {
    let eff = effective(map, id, warnings)?;
    let (transform, dims) = space(&eff, ctm, bbox, view, warnings)?;
    let stops = normalize_stops(eff.stops)?;
    Some(build(
        &eff.kind,
        eff.units,
        transform.to_row(),
        eff.spread,
        stops,
        dims,
    ))
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

/// Assembles the final [`SvgPaint`] from folded geometry + normalized stops.
fn build(
    kind: &Kind,
    units: Units,
    transform: [f64; 6],
    spread: SpreadMode,
    stops: Vec<GradientStop>,
    dims: (f64, f64),
) -> SvgPaint {
    let local =
        |c: Option<Coord>, default: Coord, dim: f64| coord_local(c.unwrap_or(default), units, dim);
    match *kind {
        Kind::Linear { x1, y1, x2, y2 } => SvgPaint::Linear(LinearGradient {
            x1: local(x1, Coord::Pct(0.0), dims.0),
            y1: local(y1, Coord::Pct(0.0), dims.1),
            x2: local(x2, Coord::Pct(1.0), dims.0),
            y2: local(y2, Coord::Pct(0.0), dims.1),
            transform,
            spread,
            stops,
        }),
        Kind::Radial { cx, cy, r, fx, fy } => {
            let cxl = local(cx, Coord::Pct(0.5), dims.0);
            let cyl = local(cy, Coord::Pct(0.5), dims.1);
            SvgPaint::Radial(RadialGradient {
                cx: cxl,
                cy: cyl,
                cr: local(r, Coord::Pct(0.5), dims.0),
                fx: fx.map_or(cxl, |c| coord_local(c, units, dims.0)),
                fy: fy.map_or(cyl, |c| coord_local(c, units, dims.1)),
                fr: 0.0,
                transform,
                spread,
                stops,
            })
        }
    }
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
