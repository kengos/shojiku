//! Form marks (`ellipse`, `checkbox`): box-inscribed vector shapes whose
//! *presence* is params-driven but whose *geometry* is template-fixed —
//! an unmatched mark still reserves its box, so the blank↔filled
//! one-template workflow never shifts layout between params sets. The
//! predicate lives in [`super::predicate`] (shared with a table row's
//! conditional styles); this module resolves the box, evaluates the
//! binding (scope-aware, like text/qr), and emits the paths.

mod presence;

#[cfg(test)]
mod tests;

use super::anchor::{PendingAnchor, PendingEllipse, PendingKind};
use crate::tree::{LayoutItem, PathShape, RectShape};
use shojiku_core::{CheckboxItem, EllipseItem, Length, OptBox, Style};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_image::PathCmd;

use super::{placed_box, with_vertical_margin, Atom, Basis, Ctx, BLACK};

/// Bézier circle constant: control-point offset for a quarter arc.
const KAPPA: f64 = 0.552_284_749_830_793_9;

/// Default outline width (pt) for form marks when NO style layer authors
/// a `borderWidth`: a mark's visible geometry is its function (the
/// blank-form state must print), unlike `rect` which follows the plain
/// Style rule (nothing draws unless authored). Mirrors the table grid's
/// own 0.5pt default — an item-level default on top of the unified Style.
const DEFAULT_MARK_STROKE_PT: f64 = 1.0;

/// A shape's resolved paint: one uniform stroke + fill + alpha, reduced
/// from the unified [`Style`] by [`Ctx::shape_paint`].
#[derive(Debug, Clone)]
pub(in crate::engine) struct ShapePaint {
    /// Uniform stroke width (pt); `0` = no stroke.
    pub width: f64,
    /// Stroke color iff `width > 0`.
    pub stroke: Option<(f32, f32, f32)>,
    /// Resolved border color regardless of width (the checkbox check mark
    /// is colored by `borderColor` even on a frameless box).
    pub stroke_color: (f32, f32, f32),
    /// `backgroundColor` fill.
    pub fill: Option<(f32, f32, f32)>,
    pub opacity: f32,
}

/// The absolute `y` of a checkbox's optional box (its frame may be omitted
/// for auto-sizing), for the absolute-placement offset in the flow,
/// band, and container walks. Pure so its box-absent / y-absent / present
/// branches are unit-testable without a full layout.
pub(in crate::engine) fn box_y(b: Option<&OptBox>) -> Option<Length> {
    b.and_then(|b| b.y)
}

/// Check-mark stroke width as a fraction of the box's shorter side, with
/// a print-legible floor.
const CHECK_STROKE_FRACTION: f64 = 0.10;
const MIN_CHECK_STROKE_PT: f64 = 0.5;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds an ellipse atom: the oval draws when it has no binding
    /// (decoration) or the binding matches; either way the box is
    /// reserved. Styled by the unified `Style` via [`Ctx::shape_paint`]
    /// (1pt outline default, uniform border).
    pub(super) fn ellipse_atom(&mut self, e: &EllipseItem, basis: &Basis) -> Option<Atom> {
        let draw = match &e.data {
            None => true,
            Some(binding) => self.mark_drawn(binding),
        };
        // Circling another item defers the whole geometry: the band it
        // centres on is only known once that item is placed. Absolutely
        // positioned for the same reason a line's anchor is, so it takes
        // no space here and `box.w`/`box.h` survive only as a size.
        if let Some(target) = &e.anchor {
            let paint = self.shape_paint(&e.style_names, &e.style, "ellipse");
            let b = e.box_.clone().unwrap_or_default();
            let size = (
                b.w.and_then(|l| self.resolve_x(Some(l), basis)),
                b.h.and_then(|l| self.resolve_y(Some(l), basis)),
            );
            self.pending_anchors.push(PendingAnchor {
                kind: PendingKind::Ellipse(PendingEllipse {
                    target: target.clone(),
                    paint,
                    size,
                    drawn: draw,
                }),
                path: self.current_path(),
                id: e.id.clone(),
                hidden: false,
            });
            return Some(Atom {
                height: 0.0,
                items: Vec::new(),
                boxes: Vec::new(),
                rb: None,
            });
        }
        let (rb, w, h) = self.mark_box(&e.box_.clone().unwrap_or_default(), basis, None)?;
        let mut items = Vec::new();
        if draw {
            let paint = self.shape_paint(&e.style_names, &e.style, "ellipse");
            items.push(LayoutItem::Path(PathShape {
                cmds: ellipse_cmds(rb.x, 0.0, w, h),
                stroke: paint.stroke,
                stroke_width: paint.width,
                fill: paint.fill,
                opacity: paint.opacity,
            }));
        }
        Some(self.finish_mark(e.id.as_deref(), rb, w, h, items))
    }

    /// Builds a checkbox atom: the frame (a stroked box) always draws; the
    /// check draws when `data:` matches or static `checked` is set
    /// (`data:` wins). The box is reserved regardless.
    pub(super) fn checkbox_atom(&mut self, c: &CheckboxItem, basis: &Basis) -> Option<Atom> {
        // A checkbox beside a label wants its frame at the label's cap
        // height; omitting `box.w`/`box.h` defaults to that cap-height
        // square (from the inherited font), so the common case needs no
        // hand-tuned size. A standalone `ellipse` still requires a size.
        let default = self.inherited_cap_square();
        let box_ = c.box_.clone().unwrap_or_default();
        let (rb, w, h) = self.mark_box(&box_, basis, Some(default))?;
        let paint = self.shape_paint(&c.style_names, &c.style, "checkbox");
        let mut items = vec![LayoutItem::Rect(RectShape {
            x: rb.x,
            y: 0.0,
            w,
            h,
            stroke: paint.stroke,
            stroke_width: paint.width,
            fill: paint.fill,
            opacity: paint.opacity,
            ..Default::default()
        })];
        let checked = match &c.data {
            Some(binding) => self.mark_drawn(binding),
            None => c.checked.unwrap_or(false),
        };
        if checked {
            items.push(LayoutItem::Path(PathShape {
                cmds: check_cmds(rb.x, w, h),
                stroke: Some(paint.stroke_color),
                stroke_width: (CHECK_STROKE_FRACTION * w.min(h)).max(MIN_CHECK_STROKE_PT),
                fill: None,
                opacity: paint.opacity,
            }));
        }
        Some(self.finish_mark(c.id.as_deref(), rb, w, h, items))
    }

    /// The inherited font's cap-height square side in pt — the checkbox
    /// auto-size default (a frame matched to a label's caps). Shared with
    /// the flex row pre-pass, which must reserve the same width the
    /// checkbox atom will draw.
    pub(in crate::engine) fn inherited_cap_square(&mut self) -> f64 {
        let computed = self.inherited.clone();
        let size = self.sane_font_size(computed.font_size);
        self.resolved_chain(&computed).primary.face.cap_height(size)
    }

    /// Resolves a mark's box, requiring a positive-finite `w`/`h`. When a
    /// `default` side is given (checkbox auto-size), an absent `w`/`h`
    /// falls back to it and is written into the box so downstream
    /// placement (flex) sees a concrete size.
    fn mark_box(
        &mut self,
        box_: &shojiku_core::OptBox,
        basis: &Basis,
        default: Option<f64>,
    ) -> Option<(shojiku_layout_box::ResolvedBox, f64, f64)> {
        let mut rb = self.resolve_box(box_, basis);
        if let Some(d) = default {
            rb.w = rb.w.or(Some(d));
            rb.h = rb.h.or(Some(d));
        }
        match (rb.w, rb.h) {
            (Some(w), Some(h)) if w.is_finite() && w > 0.0 && h.is_finite() && h > 0.0 => {
                Some((rb, w, h))
            }
            _ => {
                self.diags.push(Diagnostic::new(Code::MarkMissingSize));
                None
            }
        }
    }

    /// Reduces a shape's unified `Style` (named layers + inline) to one
    /// uniform paint. When NO layer authors `borderWidth`, the outline
    /// defaults to [`DEFAULT_MARK_STROKE_PT`]; an authored per-side map
    /// reduces to the top side with a `shape_border_sides_ignored`
    /// warning (shapes stroke one closed path, not four bands). Shared
    /// by `ellipse`, `checkbox`, and the text-anchored mark; `rect`
    /// instead routes through `push_decoration` (full per-side support,
    /// no default).
    pub(in crate::engine) fn shape_paint(
        &mut self,
        names: &[String],
        inline: &Style,
        item: &'static str,
    ) -> ShapePaint {
        let computed = self.resolve_style(names, inline);
        // A mark's outline is a closed path of its own shape (an oval, a
        // check), not a rectangle whose corners could be rounded.
        self.warn_radius_ignored(&computed, "a form mark");
        // Mirror resolve_style's MAX_STYLE_NAMES window exactly: a width
        // authored in a name PAST the cap is never applied, so it must
        // not count as "authored" (and the scan stays bounded).
        let authored = inline.border_width.is_some()
            || names
                .iter()
                .take(shojiku_core::MAX_STYLE_NAMES)
                .filter_map(|n| self.input.template.styles.get(n))
                .any(|s| s.border_width.is_some());
        let width = if authored {
            let widths = computed.border_widths;
            if widths.iter().any(|&w| w != widths[0]) {
                self.diags
                    .push(Diagnostic::new(Code::ShapeBorderSidesIgnored).arg("item", item));
            }
            self.sane_border_width(widths[0])
        } else {
            DEFAULT_MARK_STROKE_PT
        };
        // `match`, not `.map`: a never-called closure is a coverage miss.
        let stroke_color = match computed.border_colors[0].as_deref() {
            Some(c) => self.color_or_black(Some(c)),
            None => BLACK,
        };
        #[allow(clippy::manual_map)]
        let fill = match computed.background_color.as_deref() {
            Some(c) => Some(self.color_or_black(Some(c))),
            None => None,
        };
        ShapePaint {
            width,
            stroke: (width > 0.0).then_some(stroke_color),
            stroke_color,
            fill,
            opacity: self.sane_opacity(computed.opacity),
        }
    }

    /// Wraps a mark's items into an atom that reserves the whole box and
    /// carries its `id` placement (like every other leaf atom).
    fn finish_mark(
        &self,
        id: Option<&str>,
        rb: shojiku_layout_box::ResolvedBox,
        w: f64,
        h: f64,
        items: Vec<LayoutItem>,
    ) -> Atom {
        let boxes = vec![placed_box(&self.current_path(), id, &rb, w, h)];
        let (top, bottom) = (rb.margin[0], rb.margin[2]);
        with_vertical_margin(
            Atom {
                height: h,
                items,
                boxes,
                rb: Some(rb),
            },
            top,
            bottom,
        )
    }
}

/// Four-cubic ellipse inscribed in the box `(x, y, w, h)` (atom-relative,
/// y-down). The stroke centers on the path, matching `rect`. Shared with
/// the text-anchored overlay ([`super::text`]), which inscribes the oval
/// in a glyph-band-derived box (hence the explicit `y`).
pub(in crate::engine) fn ellipse_cmds(x: f64, y: f64, w: f64, h: f64) -> Vec<PathCmd> {
    let (rx, ry) = (w / 2.0, h / 2.0);
    let (cx, cy) = (x + rx, y + ry);
    let (ox, oy) = (rx * KAPPA, ry * KAPPA);
    vec![
        PathCmd::MoveTo(cx + rx, cy),
        PathCmd::CurveTo(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry),
        PathCmd::CurveTo(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy),
        PathCmd::CurveTo(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry),
        PathCmd::CurveTo(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy),
        PathCmd::Close,
    ]
}

/// Open check-mark polyline inscribed in the box (unit coordinates scaled
/// to `w`/`h`); no fill, no close.
fn check_cmds(x: f64, w: f64, h: f64) -> Vec<PathCmd> {
    vec![
        PathCmd::MoveTo(x + 0.20 * w, 0.55 * h),
        PathCmd::LineTo(x + 0.43 * w, 0.78 * h),
        PathCmd::LineTo(x + 0.80 * w, 0.25 * h),
    ]
}
