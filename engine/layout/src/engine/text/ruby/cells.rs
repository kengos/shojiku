//! Per-line glyph-cell builders for the ruby matcher: one [`Cell`] per
//! arranged/shaped glyph of a drawn line, with rich runs re-based into
//! the line's joined text so base locating works across span boundaries.
//! Rebuilds the SAME options layout measured with (block-level for plain
//! lines, per-run for rich ones), so cell extents equal what is drawn.

use shojiku_core::TextOrientation;

use super::super::super::Ctx;
use super::Cell;
use crate::font::{arrange_vertical, shape_run, FontFace, RunOptions};
use crate::tree::{TextBlock, TextLine};

impl<'a, 'b> Ctx<'a, 'b> {
    /// The face chain `[primary, …present fallbacks]` for a tree
    /// font-id set. The primary id always resolves (the tree minted it
    /// from this store); [`crate::font::FontStore::face`] falls back to
    /// the default face if it somehow doesn't, so the chain is NEVER
    /// empty — a hostile id degrades to the default face rather than
    /// silently dropping readings. A missing fallback id is skipped.
    fn chain_of(&self, font_id: &str, fallback_ids: &[String]) -> Vec<&'a FontFace> {
        let mut chain = Vec::with_capacity(1 + fallback_ids.len());
        chain.push(self.input.fonts.face(Some(font_id)));
        for id in fallback_ids {
            if let Some(f) = self.input.fonts.get(id) {
                chain.push(f);
            }
        }
        chain
    }

    /// Cells of one drawn VERTICAL line (a column): the block-level
    /// arrangement for a plain column, per-run arrangements stacked at
    /// each run's down-offset for a rich one. `at` = down from the
    /// column top.
    pub(super) fn vertical_cells(&self, block: &TextBlock, line: &TextLine) -> Vec<Cell> {
        let orient = block.vertical.unwrap_or(TextOrientation::Mixed);
        let mut cells = Vec::new();
        if line.runs.is_empty() {
            let chain = self.chain_of(&block.font_id, &block.fallback_ids);
            let opts = RunOptions {
                letter_spacing: block.letter_spacing,
                trim: block.text_spacing_trim,
                line_start: true,
                combine: block.text_combine,
            };
            let glyphs = arrange_vertical(
                &chain,
                &line.text,
                block.font_size,
                orient,
                opts,
                block.line_height,
            );
            for g in glyphs {
                cells.push(Cell {
                    source: g.source.clone(),
                    at: g.down,
                    advance: g.advance,
                    size: block.font_size,
                    top: 0.0,
                });
            }
            return cells;
        }
        let mut base = 0usize;
        for (i, run) in line.runs.iter().enumerate() {
            let chain = self.chain_of(&run.font_id, &run.fallback_ids);
            let opts = RunOptions {
                letter_spacing: run.letter_spacing,
                trim: block.text_spacing_trim,
                line_start: i == 0,
                combine: run.combine,
            };
            let glyphs = arrange_vertical(
                &chain,
                &run.text,
                run.font_size,
                orient,
                opts,
                block.line_height,
            );
            for g in glyphs {
                cells.push(Cell {
                    source: (base + g.source.start)..(base + g.source.end),
                    at: run.x + g.down,
                    advance: g.advance,
                    size: run.font_size,
                    top: 0.0,
                });
            }
            base += run.text.len();
        }
        cells
    }

    /// Cells of one drawn HORIZONTAL line: the implicit block-level run
    /// for a plain line, per-run shaping for a rich one. `at` = absolute
    /// page x; `top` = the run's em-top offset from the line's top (a
    /// rich run's glyphs sit on the shared baseline, so a small span's
    /// em band starts lower than the line top).
    pub(super) fn horizontal_cells(&self, block: &TextBlock, line: &TextLine) -> Vec<Cell> {
        let mut cells = Vec::new();
        if line.runs.is_empty() {
            let chain = self.chain_of(&block.font_id, &block.fallback_ids);
            let opts = RunOptions {
                letter_spacing: block.letter_spacing,
                trim: block.text_spacing_trim,
                line_start: true,
                combine: None,
            };
            for g in shape_run(&chain, &line.text, block.font_size, opts) {
                cells.push(Cell {
                    source: g.source.clone(),
                    at: line.x + g.x,
                    advance: g.advance,
                    size: block.font_size,
                    // A plain line's baseline sits one ascent below its
                    // top, so the em band starts AT the line top.
                    top: 0.0,
                });
            }
            return cells;
        }
        let mut base = 0usize;
        for (i, run) in line.runs.iter().enumerate() {
            let chain = self.chain_of(&run.font_id, &run.fallback_ids);
            let opts = RunOptions {
                letter_spacing: run.letter_spacing,
                trim: block.text_spacing_trim,
                line_start: i == 0,
                combine: None,
            };
            // The run's em top relative to the line top: the shared
            // baseline minus the run face's own ascent. Rich blocks
            // always carry a baseline (0 keeps a hostile tree sane).
            let baseline = block.baseline.unwrap_or(0.0);
            let top = (baseline - chain[0].ascent(run.font_size)).max(0.0);
            for g in shape_run(&chain, &run.text, run.font_size, opts) {
                cells.push(Cell {
                    source: (base + g.source.start)..(base + g.source.end),
                    at: run.x + g.x,
                    advance: g.advance,
                    size: run.font_size,
                    top,
                });
            }
            base += run.text.len();
        }
        cells
    }
}
