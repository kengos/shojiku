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

use crate::color::{parse_color, snippet};
use crate::style::ComputedStyle;
use crate::tree::{Corners, LayoutItem, LineShape, RectShape};
use shojiku_core::{BorderStyleKind, FontRel};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::Basis;

use super::Ctx;

mod dash;
mod radius;

pub(super) use dash::dash_pattern;

/// Fully resolved per-side border paint: widths (sanity-clamped),
/// colors, and line styles, `[top, right, bottom, left]`.
pub(super) struct SideBorders {
    pub widths: [f64; 4],
    pub colors: [(f32, f32, f32); 4],
    pub styles: [BorderStyleKind; 4],
}

/// Emits the per-side border lines for a border box at `(x, y, w, h)`:
/// each side with a positive width becomes one (solid) or two
/// (`double`, a third of the width each) filled rects centered on the
/// edge, so per-side and uniform-stroke forms cover the same pixels at
/// equal widths. Corners overlap; paint order top, right, bottom, left.
pub(super) fn push_side_borders(
    items: &mut Vec<LayoutItem>,
    borders: &SideBorders,
    (x, y, w, h): (f64, f64, f64, f64),
    opacity: f32,
) {
    for (side, &width) in borders.widths.iter().enumerate() {
        if width <= 0.0 {
            continue;
        }
        // The side's center line, as (x, y, w, h) of a width-thick band.
        let band = match side {
            0 => (x - width / 2.0, y - width / 2.0, w + width, width),
            1 => (x + w - width / 2.0, y - width / 2.0, width, h + width),
            2 => (x - width / 2.0, y + h - width / 2.0, w + width, width),
            _ => (x - width / 2.0, y - width / 2.0, width, h + width),
        };
        // A dashed/dotted side cannot be a filled band — the gaps are the
        // point — so it becomes a stroked centre line carrying the
        // pattern. Solid and `double` keep the filled-band emission, whose
        // pixels match the uniform stroke at equal widths.
        if let Some(pattern) = dash_pattern(borders.styles[side], width) {
            let (bx, by, bw, bh) = band;
            let (x1, y1, x2, y2) = if side % 2 == 0 {
                let mid = by + bh / 2.0;
                (bx, mid, bx + bw, mid)
            } else {
                let mid = bx + bw / 2.0;
                (mid, by, mid, by + bh)
            };
            items.push(LayoutItem::Line(LineShape {
                x1,
                y1,
                x2,
                y2,
                width,
                color: borders.colors[side],
                opacity,
                dash: Some(pattern),
            }));
            continue;
        }
        // Only solid and `double` reach here (the patterned styles took the
        // line path above), so this is an if/else rather than a match with
        // an arm no input can select.
        let stripes: &[(f64, f64)] = if borders.styles[side] == BorderStyleKind::Double {
            // CSS double: two lines of a third each, a third apart.
            &[(0.0, 1.0 / 3.0), (2.0 / 3.0, 1.0 / 3.0)]
        } else {
            // One band covering the full width.
            &[(0.0, 1.0)]
        };
        for &(offset, share) in stripes {
            let (bx, by, bw, bh) = band;
            let (sx, sy, sw, sh) = if side % 2 == 0 {
                (bx, by + bh * offset, bw, bh * share)
            } else {
                (bx + bw * offset, by, bw * share, bh)
            };
            items.push(LayoutItem::Rect(RectShape {
                x: sx,
                y: sy,
                w: sw,
                h: sh,
                stroke: None,
                stroke_width: 0.0,
                fill: Some(borders.colors[side]),
                opacity,
                ..Default::default()
            }));
        }
    }
}

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
            if fill.is_none() && stroke.is_none() {
                return radius;
            }
            items.push(LayoutItem::Rect(RectShape {
                x,
                y: 0.0,
                w,
                h,
                stroke,
                stroke_width: if stroke.is_some() { width } else { 0.0 },
                fill,
                opacity,
                radius,
                dash: stroke.and_then(|_| dash_pattern(style, width)),
            }));
            return radius;
        }

        // Per-side widths/colors or `double`: the corner treatment has no
        // meaning across mismatched sides, so it is dropped with a warning
        // rather than applied to some edges only.
        self.warn_radius_ignored(computed, "a per-side or double border");
        if let Some(fill) = fill {
            items.push(LayoutItem::Rect(RectShape {
                x,
                y: 0.0,
                w,
                h,
                stroke: None,
                stroke_width: 0.0,
                fill: Some(fill),
                opacity,
                ..Default::default()
            }));
        }
        let colors =
            [0, 1, 2, 3].map(|side| self.color_or_black(computed.border_colors[side].as_deref()));
        push_side_borders(
            items,
            &SideBorders {
                widths,
                colors,
                styles: computed.border_styles,
            },
            (x, 0.0, w, h),
            opacity,
        );
        Corners::default()
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
