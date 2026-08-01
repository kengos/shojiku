//! Shared vertical-writing column geometry: per-column down-extent measurement,
//! along-column `textAlign`, the logical `verticalAlign` column-stack
//! shift, column-left stepping, and the down-extent `…` clamp. One home so
//! the plain block ([`super::vblock`]), rich spans ([`super::vrich`]), and
//! the vertical `list` never disagree on where a column sits.

use std::ops::Range;

use crate::font::{down_advance_over, vertical_extent, FontFace, RunOptions};
use crate::tree::DecorationSpec;
use crate::wrap::no_line_end;
use shojiku_core::{TextAlign, TextCombine, TextDecoration, TextOrientation, VerticalAlign};

/// Total down-extent of a run of text in pt: the sum of the SHAPED cell
/// advances (letter spacing and half-width punctuation trimming included) — the same
/// arrangement the renderers draw (`arrange_vertical`), so measure and
/// draw cannot drift. The wrapper's per-char estimate only picks break
/// points; every extent that positions or clamps a column routes through
/// here.
pub(in crate::engine) fn column_extent(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    orient: TextOrientation,
    opts: RunOptions,
) -> f64 {
    vertical_extent(chain, text, size, orient, opts)
}

/// The along-column offset (pt) for `textAlign` within a column whose
/// inline basis is `max_down`: `left` → top (0), `center` → middle,
/// `right` → bottom. Slack is clamped ≥ 0, so a column longer than its
/// basis sits at the top rather than shifting up out of the box.
pub(in crate::engine) fn along_offset(align: TextAlign, max_down: f64, extent: f64) -> f64 {
    match align {
        TextAlign::Left => 0.0,
        TextAlign::Center => ((max_down - extent) / 2.0).max(0.0),
        TextAlign::Right => (max_down - extent).max(0.0),
    }
}

/// The left x (pt) of column `i` (0-based): columns step LEFT from the
/// content box's right edge one `col_width` at a time (vertical-writing right-to-left).
pub(in crate::engine) fn column_left(
    content_x: f64,
    content_w: f64,
    col_width: f64,
    i: usize,
) -> f64 {
    content_x + content_w - (i as f64 + 1.0) * col_width
}

/// The leftward shift (pt) `verticalAlign` applies to the whole column
/// stack — the CSS-logical mapping for `vertical_rl` (the block axis runs
/// right-to-left): `top` → the right edge (0, the default), `middle` →
/// centered, `bottom` → the left edge. Slack is clamped ≥ 0, so an
/// overflowing stack stays anchored at the right edge.
pub(in crate::engine) fn stack_shift(valign: VerticalAlign, content_w: f64, cols_w: f64) -> f64 {
    let slack = (content_w - cols_w).max(0.0);
    match valign {
        VerticalAlign::Top => 0.0,
        VerticalAlign::Middle => slack / 2.0,
        VerticalAlign::Bottom => slack,
    }
}

/// Resolves a `textDecoration` into a SIDE band for a vertical column, in
/// the tree's vertical [`DecorationSpec`] reading (`offset` = from the
/// column left, [`crate::tree::TextLine::x`], to the band's left edge; the
/// band runs the column's inked down-extent). Underline sits just right of
/// the em cell — the JLREQ side-line (side line) convention for vertical-writing; CSS
/// leaves `text-underline-position: auto` UA-defined in vertical modes —
/// and line-through rides the column axis. Thickness comes from the same
/// font tables as the horizontal spec. Shared by the plain block, rich
/// runs, and the vertical list.
pub(in crate::engine) fn vertical_decoration_spec(
    face: &FontFace,
    kind: TextDecoration,
    size: f64,
    col_w: f64,
) -> Option<DecorationSpec> {
    let (offset, thickness) = match kind {
        TextDecoration::None => return None,
        TextDecoration::Underline => {
            let (_, th) = face.underline_metrics(size);
            (col_w / 2.0 + size / 2.0, th)
        }
        TextDecoration::LineThrough => {
            let (_, th) = face.strikeout_metrics(size);
            (col_w / 2.0 - th / 2.0, th)
        }
    };
    Some(DecorationSpec { offset, thickness })
}

/// Clamps one column to `max_down` pt: keeps the longest char prefix whose
/// down-extent plus a `…` fits, drops trailing line-end kinsoku characters
/// (opening brackets) so a clamp never ends `「…`, and appends `…`.
/// Cumulative per-char advances make it O(n) in the text length (no
/// re-measure per trimmed char). Returns the text unchanged when it fits.
/// Shared by the vertical `list` (per-entry clamp) and the vertical text
/// block's `textOverflow: ellipsis`.
pub(in crate::engine) fn clamp_column_down(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    orient: TextOrientation,
    opts: RunOptions,
    max_down: f64,
) -> String {
    if column_extent(chain, text, size, orient, opts) <= max_down + 0.01 {
        return text.to_string();
    }
    trim_to(chain, text, size, orient, opts, max_down)
}

/// The unconditional tail of the clamp: keeps the longest UNIT prefix
/// whose down-extent plus a `…` fits `max_down` and ALWAYS appends the
/// `…` — the `textOverflow: ellipsis` end-column also routes here when
/// truncation cut content even though the last kept column itself fits.
/// A unit is one char, or one tate-chu-yoko combined group ([`trim_units`]) —
/// a combined cell is kept whole or dropped whole, never split.
pub(in crate::engine) fn trim_to(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    orient: TextOrientation,
    opts: RunOptions,
    max_down: f64,
) -> String {
    let ellipsis = down_advance_over(chain, '…', size, orient) + opts.letter_spacing;
    let mut acc = 0.0;
    let mut kept = String::new();
    for (range, grouped) in trim_units(text, opts.combine) {
        let slice = &text[range];
        let uw = if grouped {
            // A combined group occupies exactly one cell (the combined
            // arrangement's full-cell advance).
            size + opts.letter_spacing
        } else {
            slice
                .chars()
                .map(|c| down_advance_over(chain, c, size, orient) + opts.letter_spacing)
                .sum()
        };
        if acc + uw + ellipsis > max_down + 0.01 {
            break;
        }
        acc += uw;
        kept.push_str(slice);
    }
    while kept.chars().next_back().is_some_and(no_line_end) {
        let last = kept.chars().next_back().map_or(0, char::len_utf8);
        kept.truncate(kept.len() - last);
    }
    kept.push('…');
    kept
}

/// Splits a column's text into clamp units mirroring the combined
/// arrangement's grouping: under `all` the WHOLE text is one group;
/// under `digits N` each 2..=N ASCII digit run is a group (longer runs
/// stay per char, like the arrangement) and everything else is per-char
/// units. Pure over the text bytes.
fn trim_units(text: &str, combine: Option<TextCombine>) -> Vec<(Range<usize>, bool)> {
    let per_char = |range: Range<usize>, out: &mut Vec<(Range<usize>, bool)>| {
        let base = range.start;
        for (i, c) in text[range].char_indices() {
            out.push((base + i..base + i + c.len_utf8(), false));
        }
    };
    let mut out = Vec::new();
    let n = match combine {
        None => {
            per_char(0..text.len(), &mut out);
            return out;
        }
        Some(TextCombine::All) => {
            if !text.is_empty() {
                out.push((0..text.len(), true));
            }
            return out;
        }
        Some(TextCombine::Digits(n)) => n,
    };
    let bytes = text.as_bytes();
    let (mut rest, mut i) = (0usize, 0usize);
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let mut end = i + 1;
            while end < bytes.len() && bytes[end].is_ascii_digit() {
                end += 1;
            }
            // ASCII digits are one byte each, so byte length == run length.
            if (2..=n as usize).contains(&(end - i)) {
                per_char(rest..i, &mut out);
                out.push((i..end, true));
                rest = end;
            }
            i = end;
        } else {
            i += 1;
        }
    }
    per_char(rest..text.len(), &mut out);
    out
}
