//! The cut-point search of the `…` clamp, separated from the shaping so the
//! number of times it shapes can be counted and bounded.
//!
//! The clamp keeps the longest prefix of a line that, with `…` appended,
//! fits the box and does not end in a line-end-prohibited character.
//! Shaping one prefix per candidate would shape the line once per removed
//! char (quadratic in the line length). Instead the caller measures the
//! whole line once and passes the prefix widths that shaping the whole
//! line already determined (`known`); only a candidate with no known width
//! is shaped, and at most [`MAX_SHAPINGS`] of those are.

use crate::engine::overflow::exceeds;
use crate::wrap::no_line_end;

/// The most candidate prefixes one clamp shapes by themselves. A candidate
/// with no known width (its shaping may differ from the whole line's:
/// kerning, ligatures, contextual forms, a cut inside a cluster) is shaped
/// on its own; this bound keeps the shaping of candidates with no known
/// width linear in the line length. Once `MAX_SHAPINGS` prefixes have been
/// shaped, every later candidate with no known width is skipped, so the clamp can cut shorter than the exact
/// search would, and keeps no text at all when no candidate with a known
/// width fits. A constant (like `SHRINK_STEPS`) so the result stays
/// deterministic.
pub(super) const MAX_SHAPINGS: usize = 64;

/// What [`kept_len`] decided.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct Kept {
    /// The byte length of the prefix of the text to keep before `…`; 0
    /// keeps no text.
    pub len: usize,
    /// True when a candidate was skipped because `max_shapings` prefixes
    /// had been shaped and the candidate had no known width. When false,
    /// `len` is the longest candidate that fits with `…`, exactly.
    pub bound_reached: bool,
}

/// The prefix of `text` to keep before `…`.
///
/// `text` has no trailing whitespace. Candidates are the prefixes ending in
/// a non-whitespace char, longest first; a candidate ending in a char for
/// which `no_line_end` holds is never kept. A candidate is kept when its
/// width plus `ellipsis_w` does not exceed `content_w`. Its width is the
/// entry of `known` at its byte length (`(offset, width)` pairs in
/// ascending offset order); with no entry, `shape_width` is called on the
/// prefix, up to `max_shapings` times. `len` is 0 when no candidate fits
/// with `…`, counting only the candidates with a known width once
/// `max_shapings` prefixes have been shaped.
pub(super) fn kept_len(
    text: &str,
    ellipsis_w: f64,
    content_w: f64,
    known: &[(usize, f64)],
    mut shape_width: impl FnMut(&str) -> f64,
    max_shapings: usize,
) -> Kept {
    let mut shapings_left = max_shapings;
    let mut bound_reached = false;
    for (start, c) in text.char_indices().rev() {
        if c.is_whitespace() || no_line_end(c) {
            continue;
        }
        let end = start + c.len_utf8();
        let width = match known.binary_search_by_key(&end, |&(offset, _)| offset) {
            Ok(i) => known[i].1,
            Err(_) if shapings_left > 0 => {
                shapings_left -= 1;
                shape_width(&text[..end])
            }
            Err(_) => {
                bound_reached = true;
                continue;
            }
        };
        if !exceeds(width + ellipsis_w, content_w) {
            return Kept {
                len: end,
                bound_reached,
            };
        }
    }
    Kept {
        len: 0,
        bound_reached,
    }
}

#[cfg(test)]
mod tests;
