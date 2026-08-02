//! Per-cell / per-block glyph placement for a `char_grid` sheet: the pure
//! geometry turning one [`CellChar`] into a positioned [`TextLine`] and
//! its font size. A horizontal cell is a centered horizontal run; a
//! vertical cell is a one-cell vertical COLUMN the renderers arrange with
//! real GSUB `vert` shaping (so `ー`/brackets rotate as the font intends
//! and `、。` sit where its vert glyphs place them). A large-writing block draws
//! at `scale × font_size` centered in its n×n rect; a hang cell shares
//! its neighbour's trailing corner. No `Ctx` — the arithmetic is
//! unit-testable on its own.

use crate::font::{run_width, vertical_extent, FontFace, RunOptions};
use crate::tree::TextLine;
use shojiku_core::{TextOrientation, TextSpacingTrim};

use super::cells::CellChar;
use super::geom::GridGeom;

/// Everything one sheet's cell placements share: the grid geometry, the
/// per-cell font size, the sheet's first line, the content origin, the
/// face chain, and the tate-chu-yoko grouping in effect.
pub(super) struct CellFrame<'a> {
    pub geom: &'a GridGeom,
    pub base_size: f64,
    /// The sheet's first line, so `cell.line - lo` is sheet-relative.
    pub lo: usize,
    pub origin_x: f64,
    pub top: f64,
    pub faces: &'a [&'a FontFace],
    /// Digit-run length combined into one cell (vertical grids only).
    pub combine: Option<u8>,
}

impl CellFrame<'_> {
    /// The measurement options a vertical cell column uses — and exactly
    /// what the renderers rebuild from the emitted block (zero spacing,
    /// no trimming, the block's tate-chu-yoko), so measure == draw.
    pub(super) fn cell_opts(&self) -> RunOptions {
        RunOptions {
            letter_spacing: 0.0,
            trim: TextSpacingTrim::SpaceAll,
            line_start: true,
            // char_grid combines digit RUNS only (`all` does not apply
            // to a grid of cells).
            combine: self.combine.map(shojiku_core::TextCombine::Digits),
        }
    }
}

/// A placed glyph cell: the font size to draw it at (a block is larger
/// than a cell), the cross-axis column width its block must carry
/// (vertical grids), and the positioned line.
pub(super) struct GlyphPlacement {
    pub size: f64,
    pub col_w: f64,
    pub line: TextLine,
}

/// Places one HORIZONTAL cell's (or block's) glyph run, centered in its
/// rect. `char_grid` draws content verbatim in horizontal mode — no
/// substitution ever applies.
pub(super) fn cell_glyph(cell: &CellChar, f: &CellFrame) -> GlyphPlacement {
    let text = cell.text();
    let size = f.base_size * cell.scale as f64;
    let w = run_width(f.faces, &text, size, RunOptions::spacing_only(0.0));
    let (bx, by, bw, bh) = f.geom.block_rect(cell.line - f.lo, cell.pos, cell.scale);
    // A hang cell shares the occupied cell's trailing corner (its right).
    let dx = if cell.hang { 0.5 * bw } else { 0.0 };
    let line = TextLine {
        text,
        x: f.origin_x + bx + (bw - w) / 2.0 + dx,
        y: f.top + by + (bh - size) / 2.0,
        width: w,
        runs: Vec::new(),
    };
    GlyphPlacement {
        size,
        col_w: bw,
        line,
    }
}

/// Places one VERTICAL cell as a one-cell column: the emitted line's text
/// stays the AUTHORED characters — substitution and punctuation placement
/// are the vertical arrangement's job (GSUB `vert` on shaped faces, the
/// closed forms table on the degrade path). The column box is the cell
/// rect; the shaped down-extent centers in it.
pub(super) fn cell_column(cell: &CellChar, f: &CellFrame) -> GlyphPlacement {
    let text = cell.text();
    let size = f.base_size * cell.scale as f64;
    let extent = vertical_extent(
        f.faces,
        &text,
        size,
        TextOrientation::Upright,
        f.cell_opts(),
    );
    let (bx, by, bw, bh) = f.geom.block_rect(cell.line - f.lo, cell.pos, cell.scale);
    // A hang cell hangs half a cell below the occupied cell — the shaped
    // vert glyph (`、。` ink at its cell's top-right) then reads in the
    // trailing corner, like the pre-shaping nudge did.
    let dy = if cell.hang { 0.5 * bh } else { 0.0 };
    let line = TextLine {
        text,
        x: f.origin_x + bx,
        y: f.top + by + (bh - extent) / 2.0 + dy,
        width: extent,
        runs: Vec::new(),
    };
    GlyphPlacement {
        size,
        col_w: bw,
        line,
    }
}
