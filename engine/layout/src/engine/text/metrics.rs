//! Inspect text-metrics builder: per-line baseline + cap/em band for an
//! id-carrying horizontal text item, per-column axis + em band for a
//! vertical one — so the Designer (and an AI patch loop) can snap overlays
//! to the glyph band instead of pixel-measuring a preview. The values ride
//! the GUI-facing [`crate::boxes`] sidecar, never the renderer tree, and
//! are shifted with the box by the placement walk.

use crate::boxes::{ColumnMetric, LineMetric, TextMetrics};
use crate::style::ComputedStyle;
use crate::tree::{LayoutItem, TextBlock, TextLine};

use super::super::Ctx;
use super::find_text_block;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds the per-line (horizontal) or per-column (vertical) text
    /// metrics for a just-built text atom, in the atom's own coordinate
    /// space (the box the placement walk then shifts to the page). `None`
    /// when the atom holds no text block.
    pub(super) fn text_metrics(
        &mut self,
        items: &[LayoutItem],
        computed: &ComputedStyle,
    ) -> Option<TextMetrics> {
        if find_text_block(items)?.vertical.is_some() {
            return find_text_block(items).map(vertical_metrics);
        }
        let size = find_text_block(items)?.font_size;
        let chain = self.resolved_chain(computed);
        let face = chain.primary.face;
        let (ascent, cap, descent) = (face.ascent(size), face.cap_height(size), face.descent(size));
        drop(chain);
        let block = find_text_block(items)?;
        let baseline_off = block.baseline_offset(ascent);
        // Explicit loop (no closure) so the mark/metrics path stays
        // closure-free for the coverage gate (see shojiku-coverage).
        let mut lines = Vec::with_capacity(block.lines.len());
        for line in &block.lines {
            let baseline = line.y + baseline_off;
            lines.push(LineMetric {
                x: line.x,
                width: line.width,
                baseline,
                cap_top: baseline - cap,
                em_top: baseline - ascent,
                em_bottom: baseline + descent,
            });
        }
        Some(TextMetrics::Lines { lines })
    }
}

/// Per-line metrics of a horizontal fragment, rebuilt from the whole
/// block's ones: the band offsets (baseline relative to a line's top,
/// cap/em deltas relative to the baseline) are per-block constants
/// ([`TextBlock::baseline_offset`] is uniform across lines), so they are
/// read off the whole block's first line and re-anchored at each
/// fragment line's own y. Pure so the flow paginator can rebuild
/// fragment metrics without a font lookup — the horizontal counterpart
/// of [`vertical_metrics`] on the column splitter.
pub(in crate::engine) fn fragment_metrics(
    whole: Option<&TextMetrics>,
    block: &TextBlock,
    lines: &[TextLine],
) -> Option<TextMetrics> {
    let all = whole?.lines()?;
    let (m, first) = (all.first()?, block.lines.first()?);
    let baseline_off = m.baseline - first.y;
    let cap = m.baseline - m.cap_top;
    let ascent = m.baseline - m.em_top;
    let descent = m.em_bottom - m.baseline;
    let mut out = Vec::with_capacity(lines.len());
    for line in lines {
        let baseline = line.y + baseline_off;
        out.push(LineMetric {
            x: line.x,
            width: line.width,
            baseline,
            cap_top: baseline - cap,
            em_top: baseline - ascent,
            em_bottom: baseline + descent,
        });
    }
    Some(TextMetrics::Lines { lines: out })
}

/// Per-column metrics of a vertical block, pure over the block's own
/// fields: the column axis sits at the center of the column band
/// (`line.x + line_height/2` — where `arrange_vertical` centers glyph
/// cells) and the em band spans half the block font size to each side.
/// Pure so the flow paginator can rebuild fragment metrics without a
/// font lookup.
pub(in crate::engine) fn vertical_metrics(block: &TextBlock) -> TextMetrics {
    let half_col = block.line_height / 2.0;
    let half_em = block.font_size / 2.0;
    let mut columns = Vec::with_capacity(block.lines.len());
    for line in &block.lines {
        let baseline = line.x + half_col;
        columns.push(ColumnMetric {
            y: line.y,
            height: line.width,
            baseline,
            em_left: baseline - half_em,
            em_right: baseline + half_em,
        });
    }
    TextMetrics::Columns { columns }
}
