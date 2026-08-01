//! Fallback-aware shaping over a face chain.
//!
//! A run is itemized into maximal same-face segments (`itemize`); each
//! covered segment is shaped by harfrust (`harf`, giving kerning,
//! ligatures, and complex-script positioning), and chars no face maps fall
//! back to the primary's missing-glyph advance. This is the single home the
//! line measurer (`wrap`) and both renderers route through, so the width
//! reserved and the width drawn can never disagree — `run_width` is exactly
//! the sum of `shape_run`'s advances. A single face is a one-element chain
//! (`face_index` 0); the chain is never empty (the primary is always
//! present).

mod harf;
mod itemize;
#[cfg(test)]
mod tests;
mod trim;

use super::face::{FontFace, PositionedGlyph};
use itemize::face_for;
use shojiku_core::{TextCombine, TextSpacingTrim};

// The vertical arrangement (`super::vertical::shaped`) reuses the same
// itemize → shape-per-segment machinery for its upright (top-to-bottom)
// and rotated (horizontal, then rotated as a run) segments.
pub(crate) use harf::{shape_segment, shape_segment_vertical, ShapedGlyph, VerticalShapedGlyph};
pub(crate) use itemize::itemize;
pub(in crate::font) use trim::{is_close, is_open};

/// How a run is shaped and spaced: letter spacing plus the JP
/// micro-typography knobs. Bundled into one struct so the shaping API does
/// not grow a parameter per knob (vertical writing's direction lands here
/// next). There is deliberately NO `From<f64>` — a caller that wants
/// spacing-only measurement says so by name ([`RunOptions::spacing_only`]),
/// so a dropped trim/`line_start` thread is visible at the call site
/// instead of silently defaulting. The `line_start` derivation for drawing
/// has ONE home: [`crate::tree::TextBlock::line_runs`] (`RunView.line_start`).
#[derive(Debug, Clone, Copy)]
pub struct RunOptions {
    /// Extra advance after every glyph, in pt (CSS `letter-spacing`).
    pub letter_spacing: f64,
    /// Fullwidth-punctuation trimming (half-width punctuation). [`TextSpacingTrim::SpaceAll`]
    /// = no trimming (the default), so the shaped advances are unchanged.
    pub trim: TextSpacingTrim,
    /// Whether this run begins its line — enables the `trim_start`
    /// line-head opening-bracket trim. Interior runs and every non-first
    /// run of a line pass `false`.
    pub line_start: bool,
    /// tate-chu-yoko (`textCombineUpright`): `digits N` combines runs of up to N
    /// consecutive ASCII digits — and `all` the whole run — into one
    /// upright cell of a vertical column. Consumed only by the vertical
    /// arrangement (`font::arrange_vertical`); the horizontal shaper
    /// ignores it.
    pub combine: Option<TextCombine>,
}

impl RunOptions {
    /// Letter spacing only — an EXPLICIT choice of no trimming, mid-line.
    /// For chrome that never trims (list entries, char_grid, ruby) and for
    /// the overflow policies' deliberately-untrimmed upper-bound measures
    /// (see `engine/text/overflow.rs`).
    pub fn spacing_only(letter_spacing: f64) -> Self {
        Self {
            letter_spacing,
            trim: TextSpacingTrim::SpaceAll,
            line_start: false,
            combine: None,
        }
    }
}

/// Width of `text` in pt over the chain: exactly the sum of the shaped
/// advances (`letter_spacing` and any trimming included), so measurement
/// and drawing can never drift.
pub fn run_width(chain: &[&FontFace], text: &str, size: f64, opts: RunOptions) -> f64 {
    shape_run(chain, text, size, opts)
        .iter()
        .map(|g| g.advance)
        .sum()
}

/// Per-char advance estimate (no shaping): the styled-char wrapper measures
/// char by char to decide break points. Cross-char kerning is applied only
/// when a whole line is re-measured with [`run_width`]; this is the greedy
/// estimate, matching the pre-shaping behavior.
pub(crate) fn char_width(chain: &[&FontFace], c: char, size: f64, letter_spacing: f64) -> f64 {
    let fi = face_for(chain, c).unwrap_or(0);
    chain[fi].advance(c, size) + letter_spacing
}

/// Lays `text` out into positioned glyphs, each tagged with the chain index
/// of the face that drew it. Advances sum to [`run_width`]. Non-zero
/// `letter_spacing` suppresses optional ligatures (CSS semantics).
pub fn shape_run(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    opts: RunOptions,
) -> Vec<PositionedGlyph> {
    debug_assert!(!chain.is_empty(), "shape chain always has the primary");
    let letter_spacing = opts.letter_spacing;
    let ligatures = letter_spacing == 0.0;
    let mut out = Vec::new();
    let mut pen = 0.0;
    for seg in itemize(chain, text) {
        let seg_text = &text[seg.range.start..seg.range.end];
        // No face maps this segment -> primary's missing-glyph path.
        let fi = seg.face.unwrap_or(0);
        let ctx = SegCtx {
            text: seg_text,
            start: seg.range.start,
            face_index: fi,
        };
        let shaped = seg
            .face
            .and_then(|f| shape_segment(chain[f], seg_text, size, ligatures));
        match shaped {
            Some(glyphs) => append_shaped(&mut out, &mut pen, &glyphs, &ctx, letter_spacing),
            None => append_per_char(&mut out, &mut pen, chain[fi], &ctx, size, letter_spacing),
        }
    }
    // half-width punctuation: adjust fullwidth-punctuation advances after shaping (no
    // bundled face carries the `chws` feature, so this is synthesized).
    if opts.trim != TextSpacingTrim::SpaceAll {
        trim::apply_trim(
            &mut out,
            text,
            opts.trim,
            opts.line_start,
            size,
            letter_spacing,
        );
    }
    out
}

/// A placed segment's shared context (its run text slice, byte start, and
/// resolved fallback-chain index) — bundled to keep the append helpers off
/// the argument-count lint.
struct SegCtx<'a> {
    text: &'a str,
    start: usize,
    face_index: usize,
}

/// True when NO face in the chain maps `c` (drives `missing_glyph`; with a
/// fallback chain a glyph is missing only if every face lacks it).
pub fn all_missing(chain: &[&FontFace], c: char) -> bool {
    chain.iter().all(|f| f.glyph_id(c).is_none())
}

/// Appends a shaped segment's glyphs, advancing `pen`. Each glyph's source
/// range spans its cluster's chars (a ligature covers all of them).
fn append_shaped(
    out: &mut Vec<PositionedGlyph>,
    pen: &mut f64,
    glyphs: &[ShapedGlyph],
    ctx: &SegCtx,
    letter_spacing: f64,
) {
    let clusters: Vec<usize> = glyphs.iter().map(|g| g.cluster).collect();
    let ends = cluster_ends(&clusters, ctx.text.len());
    for (g, end) in glyphs.iter().zip(ends) {
        let advance = g.x_advance + letter_spacing;
        out.push(PositionedGlyph {
            glyph_id: g.glyph_id,
            x: *pen,
            advance,
            x_offset: g.x_offset,
            y_offset: g.y_offset,
            // `.max` fails closed on a hostile non-monotone cluster: an
            // inverted Range must never reach the renderers (ToUnicode).
            source: (ctx.start + g.cluster)..(ctx.start + end.max(g.cluster)),
            face_index: ctx.face_index,
        });
        *pen += advance;
    }
}

/// Appends a segment char by char (shaper unavailable, or missing-glyph
/// segment): each char keeps [`FontFace::advance`]'s width policy.
fn append_per_char(
    out: &mut Vec<PositionedGlyph>,
    pen: &mut f64,
    face: &FontFace,
    ctx: &SegCtx,
    size: f64,
    letter_spacing: f64,
) {
    for (i, c) in ctx.text.char_indices() {
        let advance = face.advance(c, size) + letter_spacing;
        out.push(PositionedGlyph {
            glyph_id: face.glyph_id(c).unwrap_or(0),
            x: *pen,
            advance,
            x_offset: 0.0,
            y_offset: 0.0,
            source: (ctx.start + i)..(ctx.start + i + c.len_utf8()),
            face_index: ctx.face_index,
        });
        *pen += advance;
    }
}

/// Byte boundary ending each glyph's source cluster, computed in ONE
/// reverse pass: harfrust's default cluster level is monotone
/// (non-decreasing byte offsets for an LTR buffer), so a glyph's range
/// ends where the next distinct cluster starts, and the last cluster ends
/// at the segment length. O(n) — a per-glyph scan would go quadratic on
/// params-length text (list entries measure their full string). Shared
/// with the vertical arrangement's shaped segments.
pub(crate) fn cluster_ends(clusters: &[usize], seg_len: usize) -> Vec<usize> {
    let mut ends = vec![seg_len; clusters.len()];
    for i in (0..clusters.len().saturating_sub(1)).rev() {
        // `.min` fails closed on a hostile non-monotone cluster value: an
        // end past the segment must never reach a source range (ToUnicode).
        ends[i] = if clusters[i + 1] > clusters[i] {
            clusters[i + 1].min(seg_len)
        } else {
            ends[i + 1]
        };
    }
    ends
}
