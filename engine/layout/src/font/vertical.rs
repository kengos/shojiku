//! Vertical glyph arrangement: the UAX#50 character-orientation
//! classifier, real vertical shaping (GSUB `vert` / `vmtx` via harfrust,
//! with rotated Latin shaped horizontally for kerning and ligatures), and
//! [`arrange_vertical`] — the single home both renderers call so a
//! vertical column is drawn exactly as layout measured it. A face without
//! a shaper degrades to the closed per-char presentation-form tables
//! (`forms`), which `char_grid`'s fixed cells also still use.

use shojiku_core::TextOrientation;

use super::face::FontFace;
use super::shape::RunOptions;

mod forms;
mod shaped;
#[cfg(test)]
mod tests;
mod uax50;

pub(crate) use forms::{vertical_form, vertical_offset};

/// How one character sits in a vertical line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Orientation {
    /// Drawn upright (UAX#50 `U`/`Tu`/`Tr`; everything under
    /// `text-orientation: upright`).
    Upright,
    /// Drawn rotated 90° clockwise so a horizontal script reads
    /// top-to-bottom (UAX#50 `R` under `text-orientation: mixed`).
    Rotated,
}

/// Orientation of `c` under `orientation`. Total over `char`: `upright`
/// forces [`Orientation::Upright`]; `mixed` follows the full UAX#50
/// Vertical_Orientation property (`U`/`Tu`/`Tr` upright — the `Tu`/`Tr`
/// typographic transform rides the font's GSUB `vert` feature — `R`
/// rotated).
pub fn orientation(c: char, orientation: TextOrientation) -> Orientation {
    if matches!(orientation, TextOrientation::Upright) || uax50::is_upright(c) {
        Orientation::Upright
    } else {
        Orientation::Rotated
    }
}

/// Per-character down-advance in pt of `c` (letter spacing NOT included —
/// the caller adds it once). Upright glyphs advance by the font's real
/// `vmtx` value when it has one ([`FontFace::vertical_char_advance`], the
/// same data shaping advances by), else the `ascent − descent` fallback; a
/// rotated glyph advances by its horizontal advance. The per-char ESTIMATE
/// the vertical wrapper breaks columns on — extents and draw positions use
/// the shaped arrangement itself.
pub fn down_advance(face: &FontFace, c: char, size: f64, orient: TextOrientation) -> f64 {
    match orientation(c, orient) {
        Orientation::Upright => face.vertical_char_advance(c, size),
        Orientation::Rotated => face.advance(c, size),
    }
}

/// [`down_advance`] over a face chain: measures on the first face that maps
/// `c` (the primary if none do), matching the fallback-chain rule the
/// horizontal `char_width` estimate uses.
pub fn down_advance_over(chain: &[&FontFace], c: char, size: f64, orient: TextOrientation) -> f64 {
    down_advance(chain[first_face(chain, c)], c, size, orient)
}

/// One placed glyph in a vertical column, produced by [`arrange_vertical`].
/// Carries its final cell-relative draw position — substitution, advances,
/// centering, and nudges are ALL decided in the arrangement — so a
/// renderer only translates (and rotates a `rotated` cell 90° clockwise
/// about its center: `(col_left + col_w/2, cell_top + advance/2)`).
#[derive(Debug, Clone, PartialEq)]
pub struct VGlyph {
    /// Face glyph id of the drawn glyph (GSUB `vert` applied on the shaped
    /// path, presentation-form table on the degrade path; `0` = `.notdef`).
    pub glyph_id: u32,
    /// Fallback-chain index of the face that maps the drawn glyph.
    pub face_index: usize,
    /// Offset in pt from the column top to the top of this glyph's advance
    /// cell.
    pub down: f64,
    /// Down-advance (cell height) of this glyph in pt (letter spacing
    /// included).
    pub advance: f64,
    /// Draw rotated 90° clockwise about the cell center (`mixed` Latin).
    pub rotated: bool,
    /// Pen-origin x in pt from the COLUMN LEFT edge — in the glyph's draw
    /// frame (pre-rotation for a rotated cell).
    pub dx: f64,
    /// Horizontal-baseline y in pt from the CELL TOP — in the glyph's draw
    /// frame (pre-rotation for a rotated cell).
    pub dy: f64,
    /// Byte range of the source cluster in the column text (ToUnicode; a
    /// ligature glyph spans every char of its cluster).
    pub source: std::ops::Range<usize>,
    /// Uniform scale factor applied about the pen origin (`dx`/`dy`) when
    /// drawing — `1.0` for every ordinary glyph. A tate-chu-yoko combined group
    /// wider than its 1em cell compresses through it; the arrangement has
    /// already scaled the pen positions, so renderers only scale the
    /// glyph outline itself.
    pub scale: f64,
}

/// Arranges `text` down a vertical column over the face `chain`, `col_w`
/// pt wide. Upright runs are shaped top-to-bottom (GSUB `vert`, `vmtx`
/// advances, vertical-origin offsets), rotated runs horizontally (kerning,
/// ligatures), and shaper-less faces degrade to the per-char tables.
/// `opts` mirrors the horizontal `shape_run` options: `letter_spacing`
/// (pt) widens every cell, `trim` applies the vertical half-width punctuation pass,
/// `line_start` marks a column head (the `trim_start` bracket trim), and
/// `combine` turns tate-chu-yoko digit grouping on.
pub fn arrange_vertical(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    orient: TextOrientation,
    opts: RunOptions,
    col_w: f64,
) -> Vec<VGlyph> {
    shaped::arrange(
        &shaped::Arrange {
            chain,
            size,
            orient,
            letter_spacing: opts.letter_spacing,
            trim: opts.trim,
            column_start: opts.line_start,
            combine: opts.combine,
            col_w,
        },
        text,
    )
}

/// Total down-extent in pt of `text` as a single column: the sum of the
/// ARRANGED cell advances (shaping and trimming included), so alignment
/// and clamp math agree exactly with what the renderers draw. The draw
/// positions don't affect extents, so the column width is irrelevant here.
pub(crate) fn vertical_extent(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    orient: TextOrientation,
    opts: RunOptions,
) -> f64 {
    arrange_vertical(chain, text, size, orient, opts, 0.0)
        .iter()
        .map(|g| g.advance)
        .sum()
}

/// Index of the first chain face that maps `c`, if any (gates
/// presentation-form substitution on the degrade path: a form no face
/// covers would draw `.notdef`).
fn mapped_face(chain: &[&FontFace], c: char) -> Option<usize> {
    chain.iter().position(|f| f.glyph_id(c).is_some())
}

/// First chain face that maps `c`, else the primary (index 0) — the
/// fallback-chain rule the horizontal itemizer also uses.
fn first_face(chain: &[&FontFace], c: char) -> usize {
    mapped_face(chain, c).unwrap_or(0)
}
