//! Box decoration as DATA: a decorated box's fully resolved paint, plus
//! the pure emitter over it.
//!
//! Split from the resolving half ([`super`]) for pagination: a fragment
//! must re-emit its box's decoration at its OWN height
//! (`box-decoration-break: clone`), and re-running the resolution to get
//! there would repeat every warning it emits — once per fragment. So the
//! resolution runs once, hands the builder a [`DecorationPaint`], and the
//! splitter replays it per fragment. Emission order and shapes are the
//! contract renderers already draw: one rect for a uniform border,
//! otherwise a fill rect under one filled band per border line.

use crate::tree::{Corners, Dash, LayoutItem, LineShape, RectShape};
use shojiku_core::BorderStyleKind;

use super::dash_pattern;

/// Fully resolved per-side border paint: widths (sanity-clamped),
/// colors, and line styles, `[top, right, bottom, left]`.
pub(in crate::engine) struct SideBorders {
    pub widths: [f64; 4],
    pub colors: [(f32, f32, f32); 4],
    pub styles: [BorderStyleKind; 4],
}

/// How a box's border draws, once resolved.
enum BorderPaint {
    /// One width, one color, one single-stroke style: one rect carries
    /// fill, stroke, corners and dash together (byte-identical output for
    /// templates that never grew a per-side border).
    Uniform {
        stroke: Option<(f32, f32, f32)>,
        width: f64,
        radius: Corners,
        dash: Option<Dash>,
    },
    /// Per-side widths/colors or `double`: edge-centered bands, with the
    /// background fill (if any) underneath them.
    Sides(SideBorders),
}

/// A decorated box's resolved paint, replayable at any height.
pub(in crate::engine) struct DecorationPaint {
    x: f64,
    w: f64,
    fill: Option<(f32, f32, f32)>,
    opacity: f32,
    border: BorderPaint,
}

impl DecorationPaint {
    /// The uniform fast path. `None` when there is nothing to draw — no
    /// fill and no stroke — so a caller never emits an invisible rect.
    pub(in crate::engine) fn uniform(
        (x, w): (f64, f64),
        fill: Option<(f32, f32, f32)>,
        opacity: f32,
        (stroke, width, radius): (Option<(f32, f32, f32)>, f64, Corners),
        style: BorderStyleKind,
    ) -> Option<Self> {
        if fill.is_none() && stroke.is_none() {
            return None;
        }
        Some(DecorationPaint {
            x,
            w,
            fill,
            opacity,
            border: BorderPaint::Uniform {
                stroke,
                width,
                radius,
                dash: stroke.and_then(|_| dash_pattern(style, width)),
            },
        })
    }

    /// The per-side / `double` path.
    pub(in crate::engine) fn sides(
        (x, w): (f64, f64),
        fill: Option<(f32, f32, f32)>,
        opacity: f32,
        sides: SideBorders,
    ) -> Self {
        DecorationPaint {
            x,
            w,
            fill,
            opacity,
            border: BorderPaint::Sides(sides),
        }
    }

    /// Draws this paint over the border box `(self.x, y, self.w, h)`.
    /// The vertical extent is the caller's: the builder passes the whole
    /// block, a pagination fragment passes its own slice.
    pub(in crate::engine) fn emit(&self, items: &mut Vec<LayoutItem>, y: f64, h: f64) {
        match &self.border {
            BorderPaint::Uniform {
                stroke,
                width,
                radius,
                dash,
            } => items.push(LayoutItem::Rect(RectShape {
                x: self.x,
                y,
                w: self.w,
                h,
                stroke: *stroke,
                stroke_width: if stroke.is_some() { *width } else { 0.0 },
                fill: self.fill,
                opacity: self.opacity,
                radius: *radius,
                dash: *dash,
            })),
            BorderPaint::Sides(sides) => {
                if self.fill.is_some() {
                    items.push(LayoutItem::Rect(RectShape {
                        x: self.x,
                        y,
                        w: self.w,
                        h,
                        stroke: None,
                        stroke_width: 0.0,
                        fill: self.fill,
                        opacity: self.opacity,
                        ..Default::default()
                    }));
                }
                push_side_borders(items, sides, (self.x, y, self.w, h), self.opacity);
            }
        }
    }
}

/// Emits the per-side border lines for a border box at `(x, y, w, h)`:
/// each side with a positive width becomes one (solid) or two
/// (`double`, a third of the width each) filled rects centered on the
/// edge, so per-side and uniform-stroke forms cover the same pixels at
/// equal widths. Corners overlap; paint order top, right, bottom, left.
pub(in crate::engine) fn push_side_borders(
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
