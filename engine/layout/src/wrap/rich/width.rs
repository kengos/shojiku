//! Per-char and per-token advances along the wrapping axis — the
//! measurement half of the styled-char engine, tate-chu-yoko-aware. Split from
//! [`super`] (the tokenize/assemble half) for the line budget.

use shojiku_core::TextCombine;

use crate::font::char_width;
use crate::font::vertical::down_advance_over;

use super::{RichSpan, Styled};

/// Whether this span's WHOLE content combines into one cell
/// (`textCombineUpright: all`). Such a span's chars travel as one atomic
/// token that measures one cell and never hard-breaks — splitting could
/// not help (any slice still draws as one cell), and keeping it whole
/// keeps measure == draw.
pub(super) fn is_all(spans: &[RichSpan], si: usize) -> bool {
    spans[si].combine == Some(TextCombine::All)
}

/// Advance of one styled char along the wrapping axis: its horizontal
/// advance (matches `run_width` char by char) for horizontal text, or its
/// vertical down-advance for a vertical span — measured over its own span's
/// chain, size, and letter spacing.
pub(super) fn width_of(spans: &[RichSpan], (c, si): Styled) -> f64 {
    let s = &spans[si];
    match s.orient {
        None => char_width(s.faces, c, s.size, s.letter_spacing),
        Some(o) => down_advance_over(s.faces, c, s.size, o) + s.letter_spacing,
    }
}

/// Extent of one whole token, tate-chu-yoko-aware: under `digits N`, a same-span
/// run of 2..=N consecutive ASCII digits measures as ONE cell
/// (`size + letter_spacing`), matching the combined arrangement — longer
/// runs, single digits, and everything else measure per char. Under
/// `all`, a same-span run measures as one cell regardless of content
/// (the tokenizer already made such runs their own tokens). The
/// digit-run hard-break arm stays per char — a group the greedy fill had
/// to split is no longer a group in the per-column arrangement either,
/// so measure and draw agree column by column.
pub(super) fn token_width(spans: &[RichSpan], piece: &[Styled]) -> f64 {
    let mut total = 0.0;
    let mut i = 0;
    while i < piece.len() {
        let (c, si) = piece[i];
        if is_all(spans, si) {
            let run = piece[i..].iter().take_while(|&&(_, rsi)| rsi == si).count();
            total += spans[si].size + spans[si].letter_spacing;
            i += run;
            continue;
        }
        let n = match spans[si].combine {
            Some(TextCombine::Digits(n)) if c.is_ascii_digit() => Some(n),
            _ => None,
        };
        if let Some(n) = n {
            let run = piece[i..]
                .iter()
                .take_while(|&&(rc, rsi)| rsi == si && rc.is_ascii_digit())
                .count();
            if (2..=n as usize).contains(&run) {
                total += spans[si].size + spans[si].letter_spacing;
            } else {
                // The whole run stays per char — consuming it in one step
                // keeps a suffix of an over-long run from re-combining.
                total += piece[i..i + run]
                    .iter()
                    .map(|&pc| width_of(spans, pc))
                    .sum::<f64>();
            }
            i += run;
            continue;
        }
        total += width_of(spans, piece[i]);
        i += 1;
    }
    total
}
