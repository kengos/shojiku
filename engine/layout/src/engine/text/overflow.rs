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

use crate::font::{run_width, FontFace, RunOptions};
use crate::wrap::{no_line_end, wrap_text_chain};
use shojiku_core::LineBreak;

/// The `shrink` font-size floor: below this the text is unreadable and a
/// hostile ratio of content to box could otherwise chase zero. When even
/// the floor overflows, the caller keeps the floor and warns.
pub(in crate::engine) const MIN_SHRINK_FONT_PT: f64 = 4.0;

/// Bisection steps for `shrink`. Fixed so the work is bounded on
/// attacker-sized content (each probe is one `wrap_text` pass) and the
/// result is deterministic; 24 steps resolve far below visual precision.
const SHRINK_STEPS: u32 = 24;

/// Finds the largest font size in `[MIN_SHRINK_FONT_PT, base_size]` whose
/// wrapped text fits `avail_h` (line height scales as `size * lh_mult`).
/// Returns the floor even if it still overflows — the caller detects that
/// by re-measuring and warns.
#[allow(clippy::too_many_arguments)] // measurement inputs, all primitive — a params struct would just rename them
pub(in crate::engine) fn fit_font_size(
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
        lines.len() as f64 * size * lh_mult <= avail_h + 0.01
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
/// `max_lines == 0` clamps to
/// nothing — the caller warns.
pub(in crate::engine) fn clamp_with_ellipsis(
    chain: &[&FontFace],
    mut lines: Vec<String>,
    size: f64,
    letter_spacing: f64,
    content_w: f64,
    max_lines: usize,
) -> Vec<String> {
    const ELLIPSIS: char = '…';
    lines.truncate(max_lines);
    let Some(last) = lines.last_mut() else {
        return lines;
    };
    let ellipsis_w = run_width(
        chain,
        &ELLIPSIS.to_string(),
        size,
        RunOptions::spacing_only(letter_spacing),
    );
    loop {
        let trimmed = last.trim_end();
        let fits = run_width(
            chain,
            trimmed,
            size,
            RunOptions::spacing_only(letter_spacing),
        ) + ellipsis_w
            <= content_w + 0.01;
        let ends_prohibited = trimmed.chars().next_back().is_some_and(no_line_end);
        if (fits && !ends_prohibited) || trimmed.is_empty() {
            let mut clamped = trimmed.to_string();
            clamped.push(ELLIPSIS);
            *last = clamped;
            return lines;
        }
        last.truncate(trimmed.len() - trimmed.chars().next_back().map_or(0, char::len_utf8));
    }
}

/// Single-line convenience over [`clamp_with_ellipsis`]: returns the
/// text unchanged when it fits `content_w`, else trimmed with `…`. Used
/// by `list` entries (one entry never wraps).
pub(in crate::engine) fn clamp_line(
    chain: &[&FontFace],
    text: String,
    size: f64,
    letter_spacing: f64,
    content_w: f64,
) -> String {
    if run_width(chain, &text, size, RunOptions::spacing_only(letter_spacing)) <= content_w + 0.01 {
        return text;
    }
    clamp_with_ellipsis(chain, vec![text], size, letter_spacing, content_w, 1)
        .pop()
        .unwrap_or_default()
}

#[cfg(test)]
mod tests;
