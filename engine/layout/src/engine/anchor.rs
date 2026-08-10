//! Anchored line endpoints: the deferred record and its page resolution.
//!
//! An endpoint carrying `item:` names another item's placement instead of a
//! coordinate, and that placement is only known once the page is laid out.
//! Anchoring therefore makes the line **absolutely positioned** (CSS Anchor
//! Positioning Level 1 requires it of every anchor-positioned box): the walk
//! draws nothing and reserves no height, pushing a [`PendingAnchor`] instead,
//! and page assembly resolves it against the finished box index.
//!
//! Two consequences fall out of that, both wire-visible and both stated in
//! the reference page rather than left to be discovered:
//!
//! - **The line lives on its TARGET's page**, not on the page the walk
//!   happened to be building. Two anchored endpoints landing on different
//!   pages is `anchor_cross_page`, and nothing is drawn.
//! - **Anchored lines paint last on their page.** CSS 2.1 Appendix E paints
//!   positioned content above in-flow content, so this is conformance.

mod band;
mod resolve;

use shojiku_core::{AnchorEdge, AnchorPoint, Length, PointSpec};

use crate::boxes::PlacedBox;
use crate::tree::LineShape;
use shojiku_layout_box::MAX_RESOLVED_PT;

/// One endpoint of a line whose resolution was deferred.
#[derive(Debug, Clone)]
pub(super) enum PendingEnd {
    /// A coordinate half of a MIXED line. Held unresolved because its
    /// basis is the margin box of the page the anchored half selects,
    /// which the walk does not yet know.
    Xy {
        x: Length,
        y: Length,
    },
    Anchor(AnchorPoint),
}

impl PendingEnd {
    pub(super) fn of(spec: &PointSpec) -> PendingEnd {
        match spec {
            PointSpec::Xy { x, y } => PendingEnd::Xy { x: *x, y: *y },
            PointSpec::Anchor(a) => PendingEnd::Anchor(a.clone()),
        }
    }
}

/// What a deferred item draws once its target is known.
#[derive(Debug, Clone)]
pub(super) enum PendingKind {
    Line(PendingLine),
    /// An `ellipse` circling another item: centred on the target's glyph
    /// band, sized by the authored box or by the band itself.
    Ellipse(PendingEllipse),
}

/// An `ellipse` waiting for the item it circles.
#[derive(Debug, Clone)]
pub(super) struct PendingEllipse {
    pub(super) target: String,
    /// The resolved paint, from the same `shape_paint` an immediate
    /// ellipse uses — only the path's coordinates are deferred.
    pub(super) paint: crate::engine::marks::ShapePaint,
    /// Authored `box.w` / `box.h`; unset takes the band's own extent.
    pub(super) size: (Option<f64>, Option<f64>),
    /// `data:` said draw nothing. The placement is still reported, so a
    /// Designer can show where the mark would sit.
    pub(super) drawn: bool,
}

/// A line removed from the walk, waiting for its page's box index.
#[derive(Debug, Clone)]
pub(super) struct PendingLine {
    pub(super) from: PendingEnd,
    pub(super) to: PendingEnd,
    /// The stroke as the shared `line_atom` built it — width, colour,
    /// opacity and dash already resolved through the same guards every
    /// other line goes through, with placeholder endpoints the drain
    /// overwrites. Carrying the finished shape (rather than the style it
    /// came from) is what keeps a deferred line's paint identical to an
    /// immediate one's.
    pub(super) stroke: LineShape,
    /// `style: double` splits into two strokes, and the split derives from
    /// the RESOLVED endpoints — so it is applied at drain time.
    pub(super) double: bool,
}

/// One item the walk removed from the flow, waiting for the finished page.
#[derive(Debug, Clone)]
pub(super) struct PendingAnchor {
    pub(super) kind: PendingKind,
    pub(super) path: String,
    pub(super) id: Option<String>,
    /// The item's `visible:` predicate did not hold. Stamped by
    /// `visibility::blank_since`, exactly as a `PlacedBox` is: the
    /// placement is still reported, nothing is drawn.
    pub(super) hidden: bool,
}

/// The point on `b` that `edge` names, before any offset.
pub(super) fn edge_point(b: &PlacedBox, edge: AnchorEdge) -> (f64, f64) {
    let r = b.border;
    let (cx, cy) = (r.x + r.w / 2.0, r.y + r.h / 2.0);
    match edge {
        AnchorEdge::Top => (cx, r.y),
        AnchorEdge::Right => (r.x + r.w, cy),
        AnchorEdge::Bottom => (cx, r.y + r.h),
        AnchorEdge::Left => (r.x, cy),
        AnchorEdge::Center => (cx, cy),
    }
}

/// The anchor point of `b` including the authored offset, or `None` when
/// the shift puts it past the resolve cap.
///
/// An `offset` reaches the tree without passing through `resolve_x`/`_y`,
/// so it is the one endpoint value that could carry an unbounded
/// coordinate to the render boundary — where `1e300f64 as f32` is
/// `INFINITY` and the stroke is silently dropped. Capped here against the
/// same bound every other resolved length obeys.
pub(super) fn anchor_point(b: &PlacedBox, a: &AnchorPoint) -> Option<(f64, f64)> {
    let (x, y) = edge_point(b, a.edge());
    let off = a.offset();
    let (x, y) = (x + off.x, y + off.y);
    let sane = |v: f64| v.is_finite() && v.abs() <= MAX_RESOLVED_PT;
    (sane(x) && sane(y)).then_some((x, y))
}
