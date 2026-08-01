//! Shaped vertical arrangement: splits a column's text into orientation
//! segments, shapes upright segments top-to-bottom (real GSUB `vert` +
//! `vmtx` advances via harfrust) and rotated segments horizontally (full
//! kerning/ligatures, drawn rotated 90° clockwise), and degrades to the
//! per-char presentation-form table when a face has no shaper. Every glyph
//! comes out as a [`VGlyph`] carrying its final cell-relative draw
//! position, so both renderers only translate/rotate — never re-decide.

mod combine;
mod trim;

#[cfg(test)]
pub(in crate::font::vertical) use combine::{combined_segment, segments};

use std::ops::Range;

use shojiku_core::{TextCombine, TextOrientation, TextSpacingTrim};

use super::super::shape::{
    cluster_ends, itemize, shape_segment, shape_segment_vertical, ShapedGlyph, VerticalShapedGlyph,
};
use super::{
    down_advance_over, first_face, mapped_face, orientation, vertical_form, vertical_offset,
    FontFace, Orientation, VGlyph,
};

/// Everything a column arrangement shares: the face chain, the size and
/// spacing, the trim options, and the column width the draw positions are
/// relative to.
pub(super) struct Arrange<'a> {
    pub chain: &'a [&'a FontFace],
    pub size: f64,
    pub orient: TextOrientation,
    pub letter_spacing: f64,
    pub trim: TextSpacingTrim,
    pub column_start: bool,
    /// tate-chu-yoko: the active combining mode (digit runs, or the whole run
    /// under `all`), if on.
    pub combine: Option<TextCombine>,
    pub col_w: f64,
}

/// Arranges `text` down a column: orientation segments in order, each
/// shaped (or degraded) and stacked at the running `down` offset; the
/// vertical half-width punctuation pass then trims fullwidth-punctuation cells in place
/// (a no-op under `SpaceAll`), so extents and draw positions already
/// carry it.
pub(super) fn arrange(a: &Arrange, text: &str) -> Vec<VGlyph> {
    let mut out = Vec::new();
    let mut down = 0.0;
    for (range, kind) in combine::segments(text, a.orient, a.combine) {
        let seg = &text[range.clone()];
        match kind {
            SegKind::Orient(Orientation::Upright) => {
                upright_segment(&mut out, &mut down, a, seg, range.start);
            }
            SegKind::Orient(Orientation::Rotated) => {
                rotated_segment(&mut out, &mut down, a, seg, range.start);
            }
            SegKind::Combined => {
                combine::combined_segment(&mut out, &mut down, a, seg, range.start)
            }
        }
    }
    if a.trim != TextSpacingTrim::SpaceAll {
        trim::apply_vertical_trim(
            &mut out,
            text,
            a.trim,
            a.column_start,
            a.size,
            a.letter_spacing,
        );
    }
    out
}

/// How one segment of a column is arranged.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SegKind {
    /// An ordinary orientation run (upright or rotated).
    Orient(Orientation),
    /// A tate-chu-yoko digit group: one upright 1em cell shared by the run.
    Combined,
}

/// Maximal runs of one orientation: consecutive chars sharing the
/// [`orientation`] verdict stay in one segment, so the shaper sees whole
/// CJK/Latin runs rather than single chars.
fn orient_segments(text: &str, orient: TextOrientation) -> Vec<(Range<usize>, Orientation)> {
    let mut segs: Vec<(Range<usize>, Orientation)> = Vec::new();
    for (i, c) in text.char_indices() {
        let o = orientation(c, orient);
        let end = i + c.len_utf8();
        match segs.last_mut() {
            Some((r, last)) if *last == o => r.end = end,
            _ => segs.push((i..end, o)),
        }
    }
    segs
}

/// One upright segment: itemized per face, each covered sub-run shaped
/// top-to-bottom (GSUB `vert`, `vmtx` advances, vertical-origin offsets);
/// a shaper-less face or an uncovered run degrades per-char.
fn upright_segment(out: &mut Vec<VGlyph>, down: &mut f64, a: &Arrange, seg: &str, start: usize) {
    for sub in itemize(a.chain, seg) {
        let text = &seg[sub.range.clone()];
        let base = start + sub.range.start;
        let shaped = sub
            .face
            .and_then(|fi| shape_segment_vertical(a.chain[fi], text, a.size).map(|g| (fi, g)));
        match shaped {
            Some((fi, glyphs)) => upright_shaped(out, down, a, &glyphs, text, base, fi),
            None => degrade_chars(out, down, a, text, base),
        }
    }
}

/// Appends one shaped upright sub-run. The font is authoritative: the
/// `vert` glyph, its `vmtx` advance, and the vertical-origin offsets all
/// come from shaping — no engine substitution or cell nudges apply.
fn upright_shaped(
    out: &mut Vec<VGlyph>,
    down: &mut f64,
    a: &Arrange,
    glyphs: &[VerticalShapedGlyph],
    text: &str,
    base: usize,
    face_index: usize,
) {
    let fallback = a.chain[face_index].vertical_advance(a.size);
    let clusters: Vec<usize> = glyphs.iter().map(|g| g.cluster).collect();
    let ends = cluster_ends(&clusters, text.len());
    for (g, end) in glyphs.iter().zip(ends) {
        let advance = sane_cell(g.down_advance, fallback, a.size) + a.letter_spacing;
        // A hostile source range must never reach the renderers: clamp the
        // cluster into the sub-run and keep the range non-inverted.
        let cl = g.cluster.min(text.len());
        out.push(VGlyph {
            glyph_id: g.glyph_id,
            face_index,
            down: *down,
            advance,
            rotated: false,
            dx: a.col_w / 2.0 + sane_offset(g.x_offset, a.size),
            dy: sane_offset(g.down_offset, a.size),
            source: (base + cl)..(base + end.max(cl)),
            scale: 1.0,
        });
        *down += advance;
    }
}

/// One rotated segment: itemized per face, each covered sub-run shaped
/// HORIZONTALLY (kerning, ligatures — suppressed by non-zero letter
/// spacing like the horizontal path) and stacked down the column; the
/// renderers rotate each cell 90° clockwise about its center.
fn rotated_segment(out: &mut Vec<VGlyph>, down: &mut f64, a: &Arrange, seg: &str, start: usize) {
    for sub in itemize(a.chain, seg) {
        let text = &seg[sub.range.clone()];
        let base = start + sub.range.start;
        let ligatures = a.letter_spacing == 0.0;
        let shaped = sub
            .face
            .and_then(|fi| shape_segment(a.chain[fi], text, a.size, ligatures).map(|g| (fi, g)));
        match shaped {
            Some((fi, glyphs)) => rotated_shaped(out, down, a, &glyphs, text, base, fi),
            None => degrade_chars(out, down, a, text, base),
        }
    }
}

/// Appends one shaped rotated sub-run: each glyph occupies a cell as tall
/// as its (kerned) horizontal advance, drawn centered in the column in the
/// pre-rotation frame — contiguous cells reproduce the horizontal run
/// exactly once rotated.
fn rotated_shaped(
    out: &mut Vec<VGlyph>,
    down: &mut f64,
    a: &Arrange,
    glyphs: &[ShapedGlyph],
    text: &str,
    base: usize,
    face_index: usize,
) {
    let face = a.chain[face_index];
    let cross = (face.ascent(a.size) - face.descent(a.size)) / 2.0;
    let clusters: Vec<usize> = glyphs.iter().map(|g| g.cluster).collect();
    let ends = cluster_ends(&clusters, text.len());
    for (g, end) in glyphs.iter().zip(ends) {
        let h_adv = sane_cell(g.x_advance, a.size, a.size);
        let advance = h_adv + a.letter_spacing;
        let cl = g.cluster.min(text.len());
        out.push(VGlyph {
            glyph_id: g.glyph_id,
            face_index,
            down: *down,
            advance,
            rotated: true,
            dx: a.col_w / 2.0 - h_adv / 2.0 + sane_offset(g.x_offset, a.size),
            dy: advance / 2.0 + cross + sane_offset(g.y_offset, a.size),
            source: (base + cl)..(base + end.max(cl)),
            scale: 1.0,
        });
        *down += advance;
    }
}

/// The per-char degrade path (no shaper, or no face maps the run): the
/// closed presentation-form table substitutes upright brackets/dashes, and
/// the engine-synthesized cell nudges (`、。`, small kana) apply — exactly
/// the pre-shaping v1 arrangement, kept so a hostile or broken font still
/// renders a readable column.
pub(super) fn degrade_chars(
    out: &mut Vec<VGlyph>,
    down: &mut f64,
    a: &Arrange,
    text: &str,
    base: usize,
) {
    for (i, c) in text.char_indices() {
        let rotated = matches!(orientation(c, a.orient), Orientation::Rotated);
        // The advance comes from the face that maps the AUTHORED char (the
        // wrapper's estimate rule), so a presentation form served by a
        // different fallback face can never desynchronize the column.
        let advance = down_advance_over(a.chain, c, a.size, a.orient) + a.letter_spacing;
        // Substitute only when a chain face actually covers the form —
        // otherwise keep the authored char (a readable horizontal bracket
        // beats `.notdef`).
        let pick = (!rotated)
            .then(|| vertical_form(c))
            .flatten()
            .and_then(|v| mapped_face(a.chain, v).map(|fi| (v, fi)));
        let (drawn, face_index) = pick.unwrap_or_else(|| (c, first_face(a.chain, c)));
        let face = a.chain[face_index];
        let h_adv = face.advance(drawn, a.size);
        let (dx, dy) = if rotated {
            let cross = (face.ascent(a.size) - face.descent(a.size)) / 2.0;
            (a.col_w / 2.0 - h_adv / 2.0, advance / 2.0 + cross)
        } else {
            let off = vertical_offset(c);
            (
                (a.col_w - h_adv) / 2.0 + off.0 * a.size,
                face.ascent(a.size) + off.1 * a.size,
            )
        };
        out.push(VGlyph {
            glyph_id: face.glyph_id(drawn).unwrap_or(0),
            face_index,
            down: *down,
            advance,
            rotated,
            dx,
            dy,
            source: (base + i)..(base + i + c.len_utf8()),
            scale: 1.0,
        });
        *down += advance;
    }
}

/// A shaped cell extent that survived the hostile-range guard, else
/// `fallback`: non-finite, negative, or over 4em (a broken `vmtx`/`hmtx`
/// value, e.g. a u16 advance over a tiny upem) degrades rather than
/// blowing up column math. Zero is admitted — zero-advance marks are
/// legitimate shaping output.
fn sane_cell(advance: f64, fallback: f64, size: f64) -> f64 {
    if advance.is_finite() && (0.0..=4.0 * size).contains(&advance) {
        advance
    } else {
        fallback
    }
}

/// A shaper positioning offset, zeroed when hostile: non-finite or beyond
/// ±4em cannot be a real vertical-origin/GPOS adjustment.
fn sane_offset(offset: f64, size: f64) -> f64 {
    if offset.is_finite() && offset.abs() <= 4.0 * size {
        offset
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests;
