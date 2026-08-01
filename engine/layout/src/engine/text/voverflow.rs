//! Vertical `textOverflow` policy math: column measurement (wrap + shaped
//! extents + the hung-char alignment basis), the `shrink` fit bisection,
//! and the `ellipsis` end-column clamp. The overflow axis of a vertical
//! block is its WIDTH (columns stack right-to-left), so these mirror
//! [`super::overflow`] with the axes swapped; the caller
//! ([`super::vblock`]) owns diagnostics and the final block assembly.

use crate::font::{down_advance_over, FontFace, RunOptions};
use crate::wrap::{wrap_vertical, WrappedLine};
use shojiku_core::{HangingPunctuation, LineBreak, TextOrientation, TextSpacingTrim};

use super::overflow::MIN_SHRINK_FONT_PT;
use super::vcol::{column_extent, trim_to};

/// Bisection steps for the vertical `shrink`, matching the horizontal
/// policy: bounded work on attacker-sized content, deterministic result.
const SHRINK_STEPS: u32 = 24;

/// Everything vertical wrap + measurement shares across policy probes:
/// the face chain and the style knobs that shape a column.
pub(super) struct VWrap<'a> {
    pub chain: &'a [&'a FontFace],
    pub orient: TextOrientation,
    pub line_break: LineBreak,
    pub letter_spacing: f64,
    pub trim: TextSpacingTrim,
    pub hanging: HangingPunctuation,
    /// tate-chu-yoko: the active combining mode, if on.
    pub combine: Option<shojiku_core::TextCombine>,
}

impl VWrap<'_> {
    /// The shaping options every extent measurement uses: a column is a
    /// line, so the `trim_start` column-head trim always applies.
    pub(super) fn opts(&self) -> RunOptions {
        RunOptions {
            letter_spacing: self.letter_spacing,
            trim: self.trim,
            line_start: true,
            combine: self.combine,
        }
    }
}

/// One measured column: the wrapped text plus its inked down-extent and
/// the alignment basis (a hung trailing comma sits past the column end —
/// in the margin — so it is excluded from alignment but kept in the inked
/// extent, mirroring the horizontal `TextLine.width` rule). Travels as one
/// unit so the vectors can never desynchronize.
pub(super) struct VColumn {
    pub line: WrappedLine,
    /// Inked down-extent (hung char included) — the tree's `width`.
    pub extent: f64,
    /// Alignment/height basis (hung char excluded).
    pub align_extent: f64,
}

/// Wraps `content` into columns at `size` and measures each: the shaped
/// extent (measure == draw) plus the hung-exclusion alignment basis (the
/// hung char's per-char estimate, the same subtraction the horizontal
/// plain path applies).
pub(super) fn measure_columns(v: &VWrap, content: &str, size: f64, max_down: f64) -> Vec<VColumn> {
    let columns = wrap_vertical(
        v.chain,
        content,
        size,
        max_down,
        v.line_break,
        v.letter_spacing,
        v.orient,
        v.hanging,
        v.combine,
    );
    columns
        .into_iter()
        .map(|line| {
            let text = line.text();
            let extent = column_extent(v.chain, &text, size, v.orient, v.opts());
            let hung_adv = if line.hung {
                text.chars()
                    .next_back()
                    .map_or(0.0, |c| down_advance_over(v.chain, c, size, v.orient))
                    + v.letter_spacing
            } else {
                0.0
            };
            VColumn {
                line,
                extent,
                align_extent: (extent - hung_adv).max(0.0),
            }
        })
        .collect()
}

/// Finds the largest font size in `[MIN_SHRINK_FONT_PT, base_size]` whose
/// column count fits `content_w` (the column width scales as
/// `size * lh_mult`). Returns the floor even if it still overflows — the
/// caller detects that by re-measuring and warns. Each probe is one
/// wrap pass, bounded by the fixed step count like the horizontal fit.
pub(super) fn fit_columns_size(
    v: &VWrap,
    content: &str,
    base_size: f64,
    lh_mult: f64,
    content_w: f64,
    max_down: f64,
) -> f64 {
    let fits = |size: f64| {
        let columns = wrap_vertical(
            v.chain,
            content,
            size,
            max_down,
            v.line_break,
            v.letter_spacing,
            v.orient,
            v.hanging,
            v.combine,
        );
        columns.len() as f64 * size * lh_mult <= content_w + 0.01
    };
    if fits(base_size) {
        return base_size;
    }
    let (mut lo, mut hi) = (MIN_SHRINK_FONT_PT, base_size.max(MIN_SHRINK_FONT_PT));
    for _ in 0..SHRINK_STEPS {
        let mid = (lo + hi) / 2.0;
        if fits(mid) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    lo
}

/// Ends the last kept column of an `ellipsis` clamp with `…`: appended
/// as-is when the column has room below (`extent + …` fits `max_down`),
/// else the column is trimmed line-end kinsoku-aware to make room ([`trim_to`] —
/// unconditional, since truncation cut content even when this column
/// itself fits). An unconstrained basis (∞ — the auto-height ancestor
/// case) always has room.
pub(super) fn ellipsize_column(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    orient: TextOrientation,
    opts: RunOptions,
    max_down: f64,
) -> String {
    let extent = column_extent(chain, text, size, orient, opts);
    let ellipsis = down_advance_over(chain, '…', size, orient) + opts.letter_spacing;
    if extent + ellipsis <= max_down + 0.01 {
        let mut kept = text.to_string();
        kept.push('…');
        return kept;
    }
    trim_to(chain, text, size, orient, opts, max_down)
}

#[cfg(test)]
mod tests;
