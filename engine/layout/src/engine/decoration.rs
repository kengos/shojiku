//! Box decoration: the `backgroundColor` fill and the border stroke,
//! emitted over an item's border box using existing tree primitives so
//! renderers never change. Shared by every decorated box: text blocks
//! (and thus page numbers and table cells), containers, `repeat` cells,
//! and images.
//!
//! Uniform solid borders keep the single [`RectShape`]
//! (fill + stroke in one rect — byte-identical output for untouched
//! templates). Per-side widths/colors and `double` styles emit one
//! filled rect per line, centered on the box edge like a stroke is, so
//! the uniform and per-side forms cover the same pixels at equal widths.
//!
//! This module RESOLVES; [`paint`] draws. The split exists because a
//! pagination fragment re-emits its box's decoration at its own height,
//! and resolving again per fragment would repeat every warning below.

use crate::color::{parse_color, snippet};
use crate::style::ComputedStyle;
use crate::tree::{Corners, LayoutItem};
use shojiku_core::{BorderStyleKind, FontRel};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::Basis;

use super::Ctx;

mod dash;
mod paint;
mod radius;

pub(super) use dash::dash_pattern;
pub(in crate::engine) use paint::{push_side_borders, DecorationPaint, SideBorders};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Prepends the decoration for a border box at `(x, 0)` (atom
    /// coordinates; callers translate). Emits nothing when the style has
    /// neither a fill nor a positive border width. CSS painting order:
    /// background under the border.
    /// Returns the corner radii it painted with, so a caller that also
    /// clips (`overflow: hidden`) rounds its clip to the same box instead
    /// of re-resolving — and warns twice.
    pub(super) fn push_decoration(
        &mut self,
        items: &mut Vec<LayoutItem>,
        computed: &ComputedStyle,
        x: f64,
        w: f64,
        h: f64,
    ) -> Corners {
        let (paint, radius) = self.decoration_paint(computed, x, w, h);
        if let Some(paint) = &paint {
            paint.emit(items, 0.0, h);
        }
        radius
    }

    /// [`Self::push_decoration`]'s resolving half: the style's fill,
    /// widths, colors, styles and corners as a replayable
    /// [`DecorationPaint`], plus the corners painted. Every diagnostic
    /// the decoration can raise (invalid color, ignored radius) fires
    /// HERE — exactly once — which is what lets a paginating text hand
    /// the paint to its fragments instead of re-resolving per fragment.
    /// `None` when the style draws nothing at all.
    /// `h` sizes the `%` corner radii only; the paint itself is
    /// height-independent, so a fragment replays the corners resolved for
    /// the whole block (CSS `box-decoration-break: clone` clones the
    /// decoration, it does not re-derive it).
    pub(in crate::engine) fn decoration_paint(
        &mut self,
        computed: &ComputedStyle,
        x: f64,
        w: f64,
        h: f64,
    ) -> (Option<DecorationPaint>, Corners) {
        let fill = self.background_fill(computed.background_color.as_deref());
        let opacity = self.sane_opacity(computed.opacity);
        // Clamp once for a uniform width so a hostile value warns once,
        // not four times.
        let widths = if computed
            .border_widths
            .iter()
            .all(|w| *w == computed.border_widths[0])
        {
            [self.sane_border_width(computed.border_widths[0]); 4]
        } else {
            computed.border_widths.map(|w| self.sane_border_width(w))
        };

        // The uniform-border fast path: one width, one color, and one
        // style that a single stroke can express (`solid`, or a dash
        // pattern) = one rect carrying fill, stroke, corners and dash.
        // `double` needs two lines per side and drops to the band path.
        let style = computed.border_styles[0];
        let uniform = widths.iter().all(|w| *w == widths[0])
            && computed
                .border_colors
                .iter()
                .all(|c| *c == computed.border_colors[0])
            && computed.border_styles.iter().all(|s| *s == style)
            && style != BorderStyleKind::Double;
        if uniform {
            // `em` on a box property resolves against the element's OWN
            // computed font size (CSS), not the size it inherited.
            let basis = Basis {
                x,
                w,
                h: Some(h),
                font: FontRel {
                    em: computed.font_size,
                    rem: computed.rem_root,
                },
            };
            let radius = self.corner_radius(computed, w, h, &basis);
            let width = widths[0];
            let stroke =
                (width > 0.0).then(|| self.color_or_black(computed.border_colors[0].as_deref()));
            let paint =
                DecorationPaint::uniform((x, w), fill, opacity, (stroke, width, radius), style);
            return (paint, radius);
        }

        // Per-side widths/colors or `double`: the corner treatment has no
        // meaning across mismatched sides, so it is dropped with a warning
        // rather than applied to some edges only.
        self.warn_radius_ignored(computed, "a per-side or double border");
        let colors =
            [0, 1, 2, 3].map(|side| self.color_or_black(computed.border_colors[side].as_deref()));
        let paint = DecorationPaint::sides(
            (x, w),
            fill,
            opacity,
            SideBorders {
                widths,
                colors,
                styles: computed.border_styles,
            },
        );
        (Some(paint), Corners::default())
    }

    /// Parses a `backgroundColor`. An invalid color warns and fills
    /// nothing — unlike text, a black fallback fill would be worse than
    /// none.
    pub(super) fn background_fill(&mut self, background: Option<&str>) -> Option<(f32, f32, f32)> {
        let bg = background?;
        match parse_color(bg) {
            Some(fill) => Some(fill),
            None => {
                self.diags.push(
                    Diagnostic::new(Code::InvalidColor)
                        .arg("value", snippet(bg))
                        .arg("fallback", "background skipped"),
                );
                None
            }
        }
    }
}
