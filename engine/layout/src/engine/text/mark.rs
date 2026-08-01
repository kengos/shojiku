//! Text-anchored circled-text overlay: an oval auto-centered on a text item's
//! glyph band, computed from the finished block's line geometry and the
//! primary face's cap/ascent/descent metrics. Emitted as a paint-only
//! `Path` pushed onto the atom *after* the block is built, so presence
//! never changes the item's reserved box (the blank↔filled invariant).

use crate::style::ComputedStyle;
use crate::tree::{LayoutItem, PathShape};
use shojiku_core::{FontRel, TextMark};

use shojiku_layout_box::MAX_RESOLVED_PT;

use super::super::marks::ellipse_cmds;
use super::super::{Atom, Ctx};
use super::find_text_block;

/// Default clearance between the glyph band and the oval, as a fraction of
/// the font size — the perceptual overshoot that makes the oval read as
/// circling the text rather than cutting it. Tuned against rendered output
/// (the visual-check pass), not geometry alone.
const DEFAULT_PAD_EM: f64 = 0.4;
/// Floor for the oval's width/height so a hostile negative `padding`
/// cannot collapse or invert it.
const MIN_OVAL_PT: f64 = 0.5;

/// The vertical/horizontal extent of the drawn glyphs across all lines,
/// in the block's coordinate space (y-down from the block top).
struct Band {
    top: f64,
    bottom: f64,
    left: f64,
    right: f64,
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Overlays a glyph-band oval on a just-built text atom. Presence is
    /// the same predicate as a standalone mark (always-draw decoration, or
    /// the `data:` binding); geometry comes from the block's lines and the
    /// primary face metrics, so it re-centers automatically when the font
    /// or text changes.
    pub(super) fn apply_text_mark(
        &mut self,
        atom: &mut Atom,
        mark: &TextMark,
        computed: &ComputedStyle,
    ) {
        self.text_mark_path(atom, mark, computed);
    }

    /// Builds and pushes the oval, or bails (`None`) when presence is off
    /// or there is nothing to circle. `Option` so the guards are single
    /// `?` lines rather than never-taken `else` blocks.
    fn text_mark_path(
        &mut self,
        atom: &mut Atom,
        mark: &TextMark,
        computed: &ComputedStyle,
    ) -> Option<()> {
        let draw = match &mark.data {
            None => true,
            Some(binding) => self.mark_drawn(binding),
        };
        if !draw {
            return None;
        }
        // Read the finished block once: its final size, baseline, and line
        // geometry (owned, so the borrow releases before we push the Path).
        // No closures on this path — a never-called closure becomes a
        // per-instantiation coverage miss (see shojiku-coverage).
        let (size, baseline_opt, lines) = block_geometry(find_text_block(&atom.items)?);
        let chain = self.resolved_chain(computed);
        let face = chain.primary.face;
        let (ascent, cap, descent) = (face.ascent(size), face.cap_height(size), face.descent(size));
        drop(chain);
        // The oval keys off the cap/em band: cap-top down to the descender,
        // so lowercase-only Latin and full-height CJK both sit centered. An
        // empty block yields no band (nothing to circle).
        let baseline = baseline_opt.unwrap_or(ascent);
        let band = glyph_band(&lines, baseline, cap, descent)?;
        let (x, y, w, h) = oval_rect(&band, pad_pt(mark.padding.as_ref(), size));
        let paint = self.shape_paint(&mark.style_names, &mark.style, "mark");
        atom.items.push(LayoutItem::Path(PathShape {
            cmds: ellipse_cmds(x, y, w, h),
            stroke: paint.stroke,
            stroke_width: paint.width,
            fill: paint.fill,
            opacity: paint.opacity,
        }));
        Some(())
    }
}

/// A block's `(font_size, baseline, per-line (x, y, width))`, copied out so
/// the block borrow releases. A plain fn (no closure) to keep the mark
/// path closure-free for coverage.
fn block_geometry(block: &crate::tree::TextBlock) -> (f64, Option<f64>, Vec<(f64, f64, f64)>) {
    let mut lines = Vec::with_capacity(block.lines.len());
    for l in &block.lines {
        lines.push((l.x, l.y, l.width));
    }
    (block.font_size, block.baseline, lines)
}

/// Resolves a mark's clearance to pt: the authored `padding` (em/pt/%-of-
/// size), or the em-proportional default (with the overshoot baked in).
/// `%` and `em`/`rem` resolve against the font size. An authored padding
/// can be arbitrarily large (it bypasses the box-resolution guards), so a
/// non-finite or over-`MAX_RESOLVED_PT` result degrades to the default —
/// the oval never carries a hostile coordinate into the render boundary.
fn pad_pt(padding: Option<&shojiku_core::Length>, size: f64) -> f64 {
    let default = DEFAULT_PAD_EM * size;
    match padding {
        None => default,
        Some(len) => {
            let pt = len.resolve(
                size,
                FontRel {
                    em: size,
                    rem: size,
                },
            );
            if pt.is_finite() && pt.abs() <= MAX_RESOLVED_PT {
                pt
            } else {
                default
            }
        }
    }
}

/// Unions every line's glyph extent into one band: vertically from the
/// cap-top (`baseline − cap`) to the descender bottom (`baseline +
/// descent`), horizontally over the line x-ranges. Lines are `(x, y,
/// width)`; a zero-width line (empty text) contributes nothing, so an
/// all-empty block yields `None` — nothing to circle. The min/max fold
/// runs for every line (seeded at ±∞) so a single-line block exercises
/// the same code path as a multi-line one.
fn glyph_band(lines: &[(f64, f64, f64)], baseline: f64, cap: f64, descent: f64) -> Option<Band> {
    let mut band = Band {
        top: f64::INFINITY,
        bottom: f64::NEG_INFINITY,
        left: f64::INFINITY,
        right: f64::NEG_INFINITY,
    };
    let mut any = false;
    for &(x, y, width) in lines {
        if width <= 0.0 {
            continue;
        }
        any = true;
        band.top = band.top.min(y + baseline - cap);
        band.bottom = band.bottom.max(y + baseline + descent);
        band.left = band.left.min(x);
        band.right = band.right.max(x + width);
    }
    any.then_some(band)
}

/// The oval's box `(x, y, w, h)`: the band grown by `pad` on every side,
/// re-centered on the band so a negative `pad` clamped by [`MIN_OVAL_PT`]
/// still stays centered.
fn oval_rect(band: &Band, pad: f64) -> (f64, f64, f64, f64) {
    let cx = (band.left + band.right) / 2.0;
    let cy = (band.top + band.bottom) / 2.0;
    let w = (band.right - band.left + 2.0 * pad).max(MIN_OVAL_PT);
    let h = (band.bottom - band.top + 2.0 * pad).max(MIN_OVAL_PT);
    (cx - w / 2.0, cy - h / 2.0, w, h)
}
