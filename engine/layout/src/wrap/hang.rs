//! Hanging punctuation (hanging punctuation) as a wrap post-pass: a line-terminating
//! comma or full stop hangs past the end edge instead of wrapping to the
//! next line, keeping the line count down.
//!
//! This runs AFTER [`super::kinsoku`], which is told (via its `hanging`
//! flag) to leave a *hangable* comma at a line start alone so this pass
//! can pull it up. Hangable (the shared [`hangable`] predicate) means the
//! pull leaves a legal line behind: a comma whose removal would expose a
//! prohibited line start (`。」` — the common closing-quote pattern) is
//! NOT hangable, so kinsoku push-out handles it the ordinary way. A line
//! receives **at most one** hung character (standard hanging punctuation hangs a
//! single character into the margin), so the pass is one bounded pull per
//! line — no push-out / pull-up oscillation and no merging of pathological
//! comma runs.

use super::kinsoku::{is_comma_full_stop, no_line_start};
use shojiku_core::{HangingPunctuation, LineBreak};

/// A char tagged with its input span (mirrors `wrap::rich::Styled`).
type Styled = (char, usize);

/// Whether hanging is active (either mode hangs; they differ only in
/// alignment, decided by the returned `hung` flags).
pub(super) fn enabled(mode: HangingPunctuation) -> bool {
    mode != HangingPunctuation::None
}

/// Whether `line`'s head may hang up onto the previous line: it starts
/// with a comma / full stop AND removing it would not expose a prohibited
/// line start (`。」` stays whole for the kinsoku push-out — kinsoku uses
/// this same predicate to decide what to leave for the hang pass).
pub(super) fn hangable(line: &[Styled], line_break: LineBreak) -> bool {
    line.first().is_some_and(|&(c, _)| is_comma_full_stop(c))
        && !line
            .get(1)
            .is_some_and(|&(c, _)| no_line_start(c, line_break))
}

/// Pulls at most ONE leading comma / full stop per line up onto the
/// previous line (so it hangs), drops a line emptied by that move, and
/// returns the per-line `hung` flag: a hung line's trailing punctuation is
/// excluded from alignment (it sits in the margin). A line is hung when it
/// received a pulled-up (overflowed) punctuation, and additionally — under
/// `force_end` — when it merely ends in one. Terminating by construction:
/// one pull per receiving line, each examined once, left to right.
pub(super) fn apply_hang(
    lines: &mut Vec<Vec<Styled>>,
    mode: HangingPunctuation,
    line_break: LineBreak,
) -> Vec<bool> {
    if !enabled(mode) {
        return vec![false; lines.len()];
    }
    let mut hung: Vec<bool> = Vec::with_capacity(lines.len());
    // Whether the current receiving line (the one `hung.last_mut()` points
    // at) already took its one hung character.
    let mut received = false;
    let mut i = 0;
    while i < lines.len() {
        if i > 0 && !received && hangable(&lines[i], line_break) && !lines[i - 1].is_empty() {
            let moved = lines[i].remove(0);
            lines[i - 1].push(moved);
            received = true;
            if let Some(h) = hung.last_mut() {
                *h = true;
            }
            if lines[i].is_empty() {
                // Fully hung up — drop the empty line; the next line shifts
                // into `i` with the receiver's one-pull budget spent.
                lines.remove(i);
                continue;
            }
        }
        // force_end additionally hangs a punctuation that merely ended the
        // line (excluded from alignment even though it fit).
        let ends_punct = lines[i].last().is_some_and(|&(c, _)| is_comma_full_stop(c));
        hung.push(mode == HangingPunctuation::ForceEnd && ends_punct);
        received = false; // line `i` becomes the next boundary's receiver
        i += 1;
    }
    hung
}

#[cfg(test)]
mod tests;
