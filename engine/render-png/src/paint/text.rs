//! Text drawing for the PNG backend: glyph outlines filled per run.
//! Layout decided every run's font/color/decoration
//! (`TextBlock::line_runs` — plain lines yield one implicit run,
//! rich lines their spans); `FontFace` decides glyph ids and positions.

mod vertical;

use crate::RenderPngError;
use shojiku_layout::{shape_run, FontFace, RunView, TextBlock};
use tiny_skia::{FillRule, Mask, Paint, Pixmap, Stroke, Transform};

use super::{build_path, rect_path, rgba, Painter};

impl Painter<'_> {
    /// Draws one text block run by run: all runs of a line sit on the
    /// block's baseline (layout-computed for rich blocks, the primary
    /// ascent for plain ones). A vertical block takes the column
    /// path.
    pub(crate) fn draw_text(
        &mut self,
        pixmap: &mut Pixmap,
        block: &TextBlock,
        mask: Option<&Mask>,
    ) -> Result<(), RenderPngError> {
        if let Some(orient) = block.vertical {
            return self.draw_text_vertical(pixmap, block, orient, mask);
        }
        let primary = self
            .fonts
            .get(&block.font_id)
            .ok_or_else(|| RenderPngError::UnknownFont(block.font_id.clone()))?;
        let base = block.baseline_offset(primary.ascent(block.font_size));
        for line in &block.lines {
            for run in block.line_runs(line) {
                if run.text.is_empty() {
                    continue;
                }
                self.draw_run(pixmap, &run, line.y, base, block.opacity, mask)?;
            }
        }
        Ok(())
    }

    /// Draws one run at `line_y + base` (the baseline): fallback-chain
    /// glyph outlines filled (and stroked for synthetic bold), then the
    /// run's decoration rect in the same paint.
    fn draw_run(
        &mut self,
        pixmap: &mut Pixmap,
        run: &RunView<'_>,
        line_y: f64,
        base: f64,
        opacity: f32,
        mask: Option<&Mask>,
    ) -> Result<(), RenderPngError> {
        // Fallback chain: the primary face plus any present fallback
        // faces; each glyph's `face_index` selects which one drew it.
        // `self.fonts` is a `&`-reference, so these faces outlive `&mut
        // self` (the glyph cache below borrows `self` mutably).
        let primary = self
            .fonts
            .get(run.font_id)
            .ok_or_else(|| RenderPngError::UnknownFont(run.font_id.to_string()))?;
        let mut chain: Vec<(&FontFace, &str)> = vec![(primary, run.font_id)];
        for id in run.fallback_ids {
            if let Some(f) = self.fonts.get(id) {
                chain.push((f, id.as_str()));
            }
        }
        let faces: Vec<&FontFace> = chain.iter().map(|(f, _)| *f).collect();
        let baseline_y = line_y + base;
        let mut paint = Paint::default();
        paint.set_color(rgba(run.color, opacity));
        paint.anti_alias = true;
        // Synthetic bold: stroke each filled outline in the text color
        // with the layout-owned width; advances unchanged (matches PDF).
        let bold_stroke = run.synthetic_bold.then(|| Stroke {
            width: run.synthetic_bold_stroke_width() as f32,
            ..Stroke::default()
        });
        // Synthetic italic: skew the run about its baseline (in pt,
        // before the px scale) by the layout-owned factor.
        let transform = if run.synthetic_italic {
            self.transform.pre_concat(italic_skew(baseline_y))
        } else {
            self.transform
        };
        // FontFace decides glyph ids and positions (the render
        // contract); this only fills their outlines, picking the face
        // the chain resolved per glyph. `RunView::options` carries trim +
        // line_start exactly as layout measured — never rebuild them here.
        for glyph in shape_run(&faces, run.text, run.font_size, run.options()) {
            let (gface, gid) = chain[glyph.face_index];
            // No outline (spaces, .notdef) or nothing drawable: skip.
            let Some(path) = self
                .glyph_outline(gface, gid, glyph.glyph_id, run.font_size)
                .and_then(|cmds| {
                    // Pen origin plus the shaper's positioning offset (0 for
                    // kerning/ligatures; non-zero only for GPOS marks).
                    build_path(
                        &cmds,
                        run.x + glyph.x + glyph.x_offset,
                        baseline_y + glyph.y_offset,
                    )
                })
            else {
                continue;
            };
            pixmap.fill_path(&path, &paint, FillRule::Winding, transform, mask);
            if let Some(stroke) = &bold_stroke {
                pixmap.stroke_path(&path, &paint, stroke, transform, mask);
            }
        }
        // `textDecoration` on a span run: one filled rect per run in its paint,
        // drawn unskewed even under synthetic italic (matches the PDF
        // backend). Layout precomputed offset/thickness per line top.
        if let Some(d) = run.decoration {
            if let Some(path) = rect_path(run.x, line_y + d.offset, run.width, d.thickness) {
                pixmap.fill_path(&path, &paint, FillRule::Winding, self.transform, mask);
            }
        }
        Ok(())
    }
}

/// Skew transform for synthetic italic in pt space: leans glyph tops
/// rightward by the layout-owned [`TextBlock::SYNTHETIC_ITALIC_SKEW`]
/// factor while keeping the given baseline fixed (y-down, so the skew
/// coefficient is negated). Mirrors the PDF backend's transform exactly.
fn italic_skew(baseline_y: f64) -> Transform {
    let k = TextBlock::SYNTHETIC_ITALIC_SKEW;
    Transform::from_row(1.0, 0.0, -k as f32, 1.0, (k * baseline_y) as f32, 0.0)
}
