//! Prefix widths at the cut points where a text can be cut without shaping
//! the prefix again.
//!
//! [`safe_prefix_widths`] shapes a whole run once and reports, for every
//! byte offset where cutting the run gives a prefix whose shaping is a
//! prefix of the whole run's shaping, the width of that prefix. The width
//! is the running sum of the glyph advances in the order [`super::run_width`]
//! adds them, so it is bit-for-bit the value `run_width(prefix)` returns.
//! A caller that needs the width of many prefixes (the `…` clamp) looks the
//! offset up in the returned list instead of shaping each prefix; an offset
//! that is not listed has no known width and must be measured by shaping
//! the prefix.

use super::harf::{ShapedGlyph, script_decided_end, shape_segment};
use super::itemize::itemize;
use crate::font::FontFace;

/// `(byte offset, width in pt)` for each cut point of `text` whose prefix
/// width is known without shaping the prefix, in ascending offset order.
/// `size` and `letter_spacing` are the arguments `run_width` takes with
/// `RunOptions::spacing_only(letter_spacing)`.
///
/// A cut point is listed when the prefix shapes the same alone as it does
/// inside the whole run:
/// - the end of every face segment (each segment is shaped separately);
/// - every char end of a segment whose advances are fixed per char: a
///   segment no face covers, and a segment of a face that has no shaping
///   font (`shaper_font()` is `None`, so every prefix takes the same
///   per-char advances);
/// - inside a segment shaped by harfrust, when the segment's glyph
///   clusters never decrease: the start of a cluster whose glyphs all lack
///   `unsafe_to_break`, at or after the end of the char that decides the
///   segment's script (harfrust guesses the script of a prefix from the
///   prefix's chars alone);
/// - the chars before the script-deciding char are all Common, Inherited or
///   Unknown; they are shaped once more by themselves, and the cluster
///   starts of that shaping without `unsafe_to_break` are listed (no
///   prefix of those chars has a guessed script, so each shapes the same
///   alone).
///
/// A segment whose face has a shaping font but whose buffer harfrust marked
/// as failed takes per-char advances too, but only the segment's end is
/// listed: whether harfrust fails depends on the
/// text it is given, so a shorter prefix might not fail.
pub(crate) fn safe_prefix_widths(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    letter_spacing: f64,
) -> Vec<(usize, f64)> {
    let ligatures = letter_spacing == 0.0;
    let mut out = Vec::new();
    // `width` starts at -0.0, as `Iterator::sum` over `f64` does, so a run
    // whose advances are all -0.0 gives the same bits as `run_width`.
    let mut width = -0.0;
    for seg in itemize(chain, text) {
        let seg_text = &text[seg.range.start..seg.range.end];
        let fi = seg.face.unwrap_or(0);
        let shaped = seg
            .face
            .and_then(|f| shape_segment(chain[f], seg_text, size, ligatures));
        match shaped {
            Some(glyphs) => {
                let decided = script_decided_end(seg_text);
                let place = Seg {
                    start: seg.range.start,
                    letter_spacing,
                };
                // The chars before the script-deciding char are Common,
                // Inherited or Unknown; they are shaped once more by themselves, and the cut points of
                // that shaping are listed.
                let common_len = decided.map_or(0, |d| d - last_char_len(&seg_text[..d]));
                let common = (common_len > 0)
                    .then(|| shape_segment(chain[fi], &seg_text[..common_len], size, ligatures))
                    .flatten();
                if let Some(common) = common {
                    let mut common_width = width;
                    cut_points(&common, &place, None, &mut common_width, &mut out);
                    out.push((place.start + common_len, common_width));
                }
                cut_points(&glyphs, &place, decided, &mut width, &mut out);
                out.push((place.start + seg_text.len(), width));
            }
            None => {
                let every_char = seg.face.is_none() || chain[fi].shaper_font().is_none();
                for (i, c) in seg_text.char_indices() {
                    width += chain[fi].advance(c, size) + letter_spacing;
                    let end = seg.range.start + i + c.len_utf8();
                    if every_char && end < seg.range.end {
                        out.push((end, width));
                    }
                }
                out.push((seg.range.end, width));
            }
        }
    }
    out
}

/// The byte offset of a shaped segment in the run, and the spacing added
/// to every glyph advance.
struct Seg {
    start: usize,
    letter_spacing: f64,
}

/// Adds the advances of `glyphs` to `width` one glyph at a time (the order
/// `run_width` sums them) and pushes, onto `out`, the width at the start of
/// every cluster that is a safe cut point (see [`safe_prefix_widths`]).
/// `decided` is the segment-relative end of the script-deciding char, if
/// the glyphs' text has one.
fn cut_points(
    glyphs: &[ShapedGlyph],
    seg: &Seg,
    decided: Option<usize>,
    width: &mut f64,
    out: &mut Vec<(usize, f64)>,
) {
    let monotone = glyphs.windows(2).all(|w| w[0].cluster <= w[1].cluster);
    let mut i = 0;
    while i < glyphs.len() {
        let cluster = glyphs[i].cluster;
        let len = glyphs[i..]
            .iter()
            .take_while(|g| g.cluster == cluster)
            .count();
        let group = &glyphs[i..i + len];
        let safe = monotone
            && i > 0
            && decided.is_none_or(|d| cluster >= d)
            && !group.iter().any(|g| g.unsafe_to_break);
        if safe {
            out.push((seg.start + cluster, *width));
        }
        for g in group {
            *width += g.x_advance + seg.letter_spacing;
        }
        i += len;
    }
}

/// The byte length of the last char of `text`. `text` must be non-empty;
/// for an empty `text` it returns 0.
fn last_char_len(text: &str) -> usize {
    text.chars().next_back().map_or(0, char::len_utf8)
}

#[cfg(test)]
mod tests;
