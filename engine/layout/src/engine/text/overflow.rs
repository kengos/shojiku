//! Text overflow policies: `shrink` (fit-to-box font scaling) and
//! `ellipsis` (line clamp + `…`) for definite-height boxes. Pure
//! measurement helpers over [`FontFace`] — the caller (`block.rs`)
//! owns diagnostics and the final block assembly. `visible` (the
//! default) never reaches this module.
//!
//! **Every measure here is deliberately untrimmed** (`spacing_only`: no
//! `textSpacingTrim`, no hanging exclusion). Both policies only reduce a
//! line's width or count, so the untrimmed measure is a safe upper bound
//! — a fit decided here never clips once the final lines are measured
//! with trim. Do NOT "fix" the missing trim/hang flags by threading them
//! in: trimming can only shrink a line, so the bound stays safe, and
//! threading `line_start` here would couple the probe loop to line
//! identity it does not have.

use crate::engine::overflow::exceeds;
use crate::font::{FontFace, RunOptions, run_width, safe_prefix_widths};
use crate::wrap::wrap_text_chain;
use clamp::{MAX_SHAPINGS, kept_len};
use shojiku_core::LineBreak;

mod clamp;

/// The `shrink` font-size floor: below this the text is unreadable and a
/// hostile ratio of content to box could otherwise chase zero. When even
/// the floor overflows, the caller keeps the floor and warns.
pub(crate) const MIN_SHRINK_FONT_PT: f64 = 4.0;

/// Bisection steps for `shrink`. Fixed so the work is bounded on
/// attacker-sized content (each probe is one `wrap_text` pass) and the
/// result is deterministic; 24 steps resolve far below visual precision.
const SHRINK_STEPS: u32 = 24;

/// Finds the largest font size in `[MIN_SHRINK_FONT_PT, base_size]` whose
/// wrapped text fits `avail_h` (line height scales as `size * lh_mult`).
/// Returns the floor even if it still overflows — the caller detects that
/// by re-measuring and warns.
#[allow(clippy::too_many_arguments)] // measurement inputs, all primitive — a params struct would just rename them
pub(crate) fn fit_font_size(
    chain: &[&FontFace],
    content: &str,
    base_size: f64,
    lh_mult: f64,
    content_w: f64,
    avail_h: f64,
    line_break: LineBreak,
    letter_spacing: f64,
) -> f64 {
    let fits = |size: f64| {
        let lines = wrap_text_chain(chain, content, size, content_w, line_break, letter_spacing);
        !exceeds(lines.len() as f64 * size * lh_mult, avail_h)
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
    // `lo` is the largest probed size known to fit — unless nothing fits,
    // in which case it is still the floor.
    lo
}

/// Clamps wrapped `lines` to `max_lines`, trimming the last kept line
/// until it fits `content_w` with `…` appended (measured with the same
/// face/size/spacing as the text, so reserved == drawn). Trailing
/// line-end-prohibited characters (line-end kinsoku: opening brackets and
/// opening quotes) are dropped so a clamp never ends `「…` or `“…`.
/// `max_lines == 0` clamps to nothing — the caller warns.
///
/// The kept text is the longest prefix that fits, except on a line where
/// more than `clamp::MAX_SHAPINGS` candidate prefixes (those whose width
/// shaping the whole line does not determine) would have to be shaped to
/// find it: once that many are shaped, only candidates with a known width
/// are considered, so the kept text can be shorter than the longest
/// prefix that fits, and is empty when no candidate with a known width
/// fits. See [`clamp_with_ellipsis_checked`] to learn whether the shaping
/// bound was reached. The cost is one shaping of the line plus at most
/// `MAX_SHAPINGS` shapings of a prefix, so it is linear in the line length.
pub(crate) fn clamp_with_ellipsis(
    chain: &[&FontFace],
    lines: Vec<String>,
    size: f64,
    letter_spacing: f64,
    content_w: f64,
    max_lines: usize,
) -> Vec<String> {
    clamp_with_ellipsis_checked(chain, lines, size, letter_spacing, content_w, max_lines).lines
}

/// The result of [`clamp_with_ellipsis_checked`].
pub(crate) struct Clamped {
    /// The clamped lines.
    pub lines: Vec<String>,
    /// True when `MAX_SHAPINGS` prefixes were shaped and a later candidate
    /// with no known width was skipped (see [`clamp_with_ellipsis`]), so
    /// the last line's kept text may be shorter than the longest prefix
    /// that fits. False when the kept text is exactly the longest prefix
    /// that fits.
    pub bound_reached: bool,
}

/// [`clamp_with_ellipsis`], also reporting whether `MAX_SHAPINGS` prefixes
/// were shaped and a later candidate with no known width was skipped.
pub(crate) fn clamp_with_ellipsis_checked(
    chain: &[&FontFace],
    lines: Vec<String>,
    size: f64,
    letter_spacing: f64,
    content_w: f64,
    max_lines: usize,
) -> Clamped {
    let opts = RunOptions::spacing_only(letter_spacing);
    clamp_with_shaper(
        chain,
        lines,
        (size, letter_spacing),
        content_w,
        max_lines,
        |prefix| run_width(chain, prefix, size, opts),
    )
}

/// The body of [`clamp_with_ellipsis_checked`], with the shaping of a
/// candidate prefix passed in as `shape_width` so a test can count how many
/// prefixes are shaped. `(size, letter_spacing)` are the measurement
/// arguments of `run_width`.
fn clamp_with_shaper(
    chain: &[&FontFace],
    mut lines: Vec<String>,
    (size, letter_spacing): (f64, f64),
    content_w: f64,
    max_lines: usize,
    shape_width: impl FnMut(&str) -> f64,
) -> Clamped {
    const ELLIPSIS: char = '…';
    lines.truncate(max_lines);
    let Some(last) = lines.last_mut() else {
        return Clamped {
            lines,
            bound_reached: false,
        };
    };
    let opts = RunOptions::spacing_only(letter_spacing);
    let ellipsis_w = run_width(chain, &ELLIPSIS.to_string(), size, opts);
    let text = last.trim_end();
    // `safe_prefix_widths` shapes the line once (and its leading Common,
    // Inherited or Unknown chars once more) and lists the width of each prefix whose shaping
    // alone equals its part of the line's shaping; a candidate prefix with
    // no width in `known` is shaped by itself, at most `MAX_SHAPINGS` times.
    let known = safe_prefix_widths(chain, text, size, letter_spacing);
    let kept = kept_len(
        text,
        ellipsis_w,
        content_w,
        &known,
        shape_width,
        MAX_SHAPINGS,
    );
    let mut clamped = text[..kept.len].to_string();
    clamped.push(ELLIPSIS);
    *last = clamped;
    Clamped {
        lines,
        bound_reached: kept.bound_reached,
    }
}

/// Single-line convenience over [`clamp_with_ellipsis`]: returns the
/// text unchanged when it fits `content_w`, else trimmed with `…`. Used
/// by `list` entries (one entry never wraps).
pub(crate) fn clamp_line(
    chain: &[&FontFace],
    text: String,
    size: f64,
    letter_spacing: f64,
    content_w: f64,
) -> String {
    if !exceeds(
        run_width(chain, &text, size, RunOptions::spacing_only(letter_spacing)),
        content_w,
    ) {
        return text;
    }
    clamp_with_ellipsis(chain, vec![text], size, letter_spacing, content_w, 1)
        .pop()
        .unwrap_or_default()
}

#[cfg(test)]
mod tests;
