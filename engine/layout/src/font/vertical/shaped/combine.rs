//! tate-chu-yoko (tate-chū-yoko) combined cells: runs of up to N consecutive
//! ASCII digits (`digits N`) — or a whole run (`all`) — shaped
//! horizontally and drawn upright in ONE 1em cell of the column. The
//! scanner carves the digit groups out first and hands everything
//! between them to the ordinary orientation segmentation; groups longer
//! than N are NOT combined (the CSS `digits` rule) and flow through as
//! ordinary runs.

use std::ops::Range;

use shojiku_core::{TextCombine, TextOrientation};

use super::super::super::shape::{cluster_ends, itemize, shape_segment};
use super::super::VGlyph;
use super::{degrade_chars, orient_segments, sane_cell, sane_offset, Arrange, SegKind};

/// Splits a column's text into arrangement segments: tate-chu-yoko digit groups
/// (under `digits N`) — or the WHOLE text as one group (under `all`) —
/// plus maximal orientation runs for the rest. Visible to the
/// `font::vertical` tests (the scanner is pure).
pub(in crate::font::vertical) fn segments(
    text: &str,
    orient: TextOrientation,
    combine: Option<TextCombine>,
) -> Vec<(Range<usize>, SegKind)> {
    let n = match combine {
        None => return orient_wrapped(text, 0, orient),
        // `all`: the whole run is one combined cell (empty text stays
        // segment-free, like the orientation path).
        Some(TextCombine::All) => {
            return if text.is_empty() {
                Vec::new()
            } else {
                vec![(0..text.len(), SegKind::Combined)]
            };
        }
        Some(TextCombine::Digits(n)) => n,
    };
    let mut out = Vec::new();
    let mut rest = 0usize;
    let mut i = 0usize;
    let bytes = text.as_bytes();
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let mut end = i + 1;
            while end < bytes.len() && bytes[end].is_ascii_digit() {
                end += 1;
            }
            // ASCII digits are one byte each, so byte length == run length.
            if (2..=n as usize).contains(&(end - i)) {
                out.extend(orient_wrapped(&text[rest..i], rest, orient));
                out.push((i..end, SegKind::Combined));
                rest = end;
            }
            i = end;
        } else {
            i += 1;
        }
    }
    out.extend(orient_wrapped(&text[rest..], rest, orient));
    out
}

/// [`orient_segments`] over a slice, rebased to absolute byte offsets and
/// wrapped in [`SegKind::Orient`].
fn orient_wrapped(
    slice: &str,
    base: usize,
    orient: TextOrientation,
) -> Vec<(Range<usize>, SegKind)> {
    orient_segments(slice, orient)
        .into_iter()
        .map(|(r, o)| ((base + r.start)..(base + r.end), SegKind::Orient(o)))
        .collect()
}

/// Arranges one combined group (a digit run, or a whole `all` run) into
/// a single upright cell: the group is shaped HORIZONTALLY on the one
/// face that covers it, centered in the column, and compressed (never
/// stretched) to fit the 1em cell when wider. Every glyph shares the
/// cell's `down`; the full cell advance (`size + letter_spacing` — no
/// interior spacing, like a single glyph) rides the LAST glyph so extent
/// sums and the trim pass's restacking stay exact. A group no single
/// face covers degrades per char (no combining), keeping the
/// hostile-font posture.
pub(in crate::font::vertical) fn combined_segment(
    out: &mut Vec<VGlyph>,
    down: &mut f64,
    a: &Arrange,
    seg: &str,
    start: usize,
) {
    let subs = itemize(a.chain, seg);
    let shaped = match subs.as_slice() {
        [one] => one
            .face
            .and_then(|fi| shape_segment(a.chain[fi], seg, a.size, true).map(|g| (fi, g))),
        _ => None,
    };
    let Some((face_index, glyphs)) = shaped else {
        degrade_chars(out, down, a, seg, start);
        return;
    };
    let face = a.chain[face_index];
    let widths: Vec<f64> = glyphs
        .iter()
        .map(|g| sane_cell(g.x_advance, a.size, a.size))
        .collect();
    let group_w: f64 = widths.iter().sum();
    // Compress an over-wide group into the cell; the guard keeps a
    // degenerate all-zero-advance group at scale 1 (nothing to fit).
    let scale = if group_w > a.size && group_w > 0.0 {
        a.size / group_w
    } else {
        1.0
    };
    let advance = a.size + a.letter_spacing;
    // Vertically center the scaled em box in the 1em cell; the baseline
    // sits `ascent × scale` below the box top (descent is negative).
    let em_h = (face.ascent(a.size) - face.descent(a.size)) * scale;
    let baseline_dy = (a.size - em_h) / 2.0 + face.ascent(a.size) * scale;
    let mut pen = (a.col_w - group_w * scale) / 2.0;
    let clusters: Vec<usize> = glyphs.iter().map(|g| g.cluster).collect();
    let ends = cluster_ends(&clusters, seg.len());
    let last = glyphs.len().saturating_sub(1);
    for (k, (g, end)) in glyphs.iter().zip(ends).enumerate() {
        let cl = g.cluster.min(seg.len());
        out.push(VGlyph {
            glyph_id: g.glyph_id,
            face_index,
            down: *down,
            advance: if k == last { advance } else { 0.0 },
            rotated: false,
            dx: pen + sane_offset(g.x_offset, a.size) * scale,
            dy: baseline_dy + sane_offset(g.y_offset, a.size) * scale,
            source: (start + cl)..(start + end.max(cl)),
            scale,
        });
        pen += widths[k] * scale;
    }
    *down += advance;
}
