//! Auto-row height measurement: what each cell needs before the row is
//! drawn. Split from the module root for the line budget; it runs under
//! the same per-cell path window the drawing pass uses, so a guard
//! warning raised while measuring names the same column.

use crate::engine::text::column_extent;
use crate::wrap::wrap_text_chain;
use shojiku_core::WritingMode;

use super::super::super::Ctx;
use super::{Cell, CellContent};

impl<'a, 'b> Ctx<'a, 'b> {
    /// The height an auto row needs: the `minHeight` floor raised by every
    /// cell that measures taller. Text wraps with the same sanitized
    /// metrics and content width `text_block` will draw with, so measure
    /// and render cannot disagree; container cells lay out against an
    /// unknown height in a discarded measure pass. Qr/image cells scale to
    /// the row height instead of driving it, so they measure to nothing.
    pub(super) fn measure_row(
        &mut self,
        cells: &[Cell],
        region_x: f64,
        (min_h, padding): (f64, f64),
    ) -> f64 {
        let mut h = min_h;
        let mut cx = region_x;
        for cell in cells {
            // Measuring resolves the cell's font chain and sanitizes its
            // metrics, so the guard warnings (unknown family, hostile size
            // or letter-spacing) are raised HERE — inside the cell's own
            // column, like the drawing pass below.
            let mark = cell.path.segment().map(|seg| self.enter_item(seg));
            match &cell.content {
                CellContent::Text(text) => {
                    // Resolve the same chain the cell will draw with, so
                    // measured and rendered metrics match (a real bold face has
                    // different advances than the regular; a fallback face
                    // different again).
                    let chain = self.resolved_chain(&cell.computed);
                    let size = self.sane_font_size(cell.computed.font_size);
                    let spacing = self.sane_letter_spacing(cell.computed.letter_spacing);
                    let cell_h = if cell.computed.writing_mode == WritingMode::VerticalRl {
                        // vertical-writing: the row is as tall as the longest column
                        // (one column per `\n`-split paragraph, unconstrained),
                        // so the render pass (`box_h = row_h`) wraps nothing.
                        let orient = cell.computed.text_orientation;
                        // Measured UNTRIMMED (`spacing_only`) on purpose:
                        // the wrapper breaks columns on untrimmed per-char
                        // estimates, so the untrimmed extent is the safe
                        // upper bound that keeps the render pass (box_h =
                        // row_h) from re-wrapping — a trimmed measure
                        // would come in under the break estimate and split
                        // the column (the horizontal probes follow the
                        // same rule; see `engine/text/overflow.rs`).
                        let opts = crate::font::RunOptions::spacing_only(spacing);
                        let extent = text
                            .split('\n')
                            .map(|p| column_extent(&chain.faces, p, size, orient, opts))
                            .fold(0.0, f64::max);
                        extent + padding * 2.0
                    } else {
                        let inner_w = (cell.width - padding * 2.0).max(0.0);
                        let line_height = size * self.sane_line_height(cell.computed.line_height);
                        let lines = wrap_text_chain(
                            &chain.faces,
                            text,
                            size,
                            inner_w,
                            cell.computed.line_break,
                            spacing,
                        );
                        lines.len() as f64 * line_height + padding * 2.0
                    };
                    h = h.max(cell_h);
                }
                CellContent::Cell { item, scope } => {
                    let pair = (*item, scope.clone());
                    h = h.max(self.measure_cell(pair, &cell.computed, (cx, cell.width)));
                }
                CellContent::Qr(_) | CellContent::Image { .. } => {}
            }
            if let Some(mark) = mark {
                self.leave_item(mark);
            }
            cx += cell.width;
        }
        h
    }
}
