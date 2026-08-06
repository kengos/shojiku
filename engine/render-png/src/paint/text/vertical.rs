//! Vertical text drawing for the PNG backend: one column per
//! [`TextLine`], each glyph placed by the shared `arrange_vertical` home so
//! drawing matches what layout measured. A plain column draws in the block
//! style; a rich column draws its per-span [`TextRun`]s, each stacked at its
//! own down-offset (`run.x`) in its own font/size/color. Mirrors the PDF
//! backend's placement exactly.

use shojiku_layout::{
    arrange_vertical, FontFace, FontStore, RunOptions, TextBlock, TextOrientation, VGlyph,
};
use tiny_skia::{FillRule, Mask, Paint, Pixmap, Transform};

use super::super::{build_path, rect_path, rgba, Painter};
use crate::RenderPngError;

/// One column's draw inputs: the face chain (with ids for the glyph cache),
/// its measurement style, the column left / width, and the page-y the
/// column's first cell sits at.
struct Column<'a> {
    chain: Vec<(&'a FontFace, &'a str)>,
    size: f64,
    /// The shaping options layout measured with (letter spacing, half-width punctuation
    /// trim, column-head flag), rebuilt exactly like the horizontal
    /// `RunView::options` path so drawing matches the reserved extents.
    opts: RunOptions,
    col_left: f64,
    col_w: f64,
    down_base: f64,
    orient: TextOrientation,
}

impl Painter<'_> {
    /// Draws a vertical block column by column. A plain block draws each
    /// line in the block style; a rich block draws each line's runs.
    pub(super) fn draw_text_vertical(
        &mut self,
        pixmap: &mut Pixmap,
        block: &TextBlock,
        orient: TextOrientation,
        mask: Option<&Mask>,
    ) -> Result<(), RenderPngError> {
        let col_w = block.line_height;
        for line in &block.lines {
            if line.runs.is_empty() {
                let chain = build_chain(self.fonts, &block.font_id, &block.fallback_ids)?;
                let mut paint = column_paint(block.color, block.opacity);
                let col = Column {
                    chain,
                    size: block.font_size,
                    opts: RunOptions {
                        letter_spacing: block.letter_spacing,
                        trim: block.text_spacing_trim,
                        line_start: true,
                        combine: block.text_combine,
                    },
                    col_left: line.x,
                    col_w,
                    down_base: line.y,
                    orient,
                };
                self.draw_column(pixmap, &col, &line.text, &mut paint, mask);
                // `textDecoration` as a SIDE band: one filled rect per column
                // at the layout-resolved x offset, running the column's
                // inked down-extent (mirrors the PDF backend).
                if let Some(d) = block.decoration {
                    if let Some(path) =
                        rect_path(line.x + d.offset, line.y, d.thickness, line.width)
                    {
                        pixmap.fill_path(&path, &paint, FillRule::Winding, self.transform, mask);
                    }
                }
            } else {
                for (i, run) in line.runs.iter().enumerate() {
                    let chain = build_chain(self.fonts, &run.font_id, &run.fallback_ids)?;
                    let mut paint = column_paint(run.color, block.opacity);
                    let col = Column {
                        chain,
                        size: run.font_size,
                        opts: RunOptions {
                            letter_spacing: run.letter_spacing,
                            trim: block.text_spacing_trim,
                            line_start: i == 0,
                            // tate-chu-yoko rides the run (span cascade),
                            // matching how layout measured it.
                            combine: run.combine,
                        },
                        col_left: line.x,
                        col_w,
                        down_base: line.y + run.x,
                        orient,
                    };
                    self.draw_column(pixmap, &col, &run.text, &mut paint, mask);
                    // Per-run decoration band alongside the run's extent.
                    if let Some(d) = run.decoration {
                        if let Some(path) =
                            rect_path(line.x + d.offset, line.y + run.x, d.thickness, run.width)
                        {
                            pixmap.fill_path(
                                &path,
                                &paint,
                                FillRule::Winding,
                                self.transform,
                                mask,
                            );
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Arranges `text` down `col` and fills each glyph's outline.
    fn draw_column(
        &mut self,
        pixmap: &mut Pixmap,
        col: &Column,
        text: &str,
        paint: &mut Paint,
        mask: Option<&Mask>,
    ) {
        let faces: Vec<&FontFace> = col.chain.iter().map(|(f, _)| *f).collect();
        let glyphs = arrange_vertical(&faces, text, col.size, col.orient, col.opts, col.col_w);
        for g in &glyphs {
            let face = col.chain[g.face_index];
            self.draw_vglyph(pixmap, col, g, face, paint, mask);
        }
    }

    /// Fills one arranged glyph's outline at its column cell. The
    /// arrangement already decided the cell-relative pen position (`dx`
    /// from the column left, `dy` from the cell top); a rotated cell draws
    /// in its pre-rotation frame under a 90°-clockwise transform about the
    /// cell center, mirroring the PDF backend exactly.
    fn draw_vglyph(
        &mut self,
        pixmap: &mut Pixmap,
        col: &Column,
        g: &VGlyph,
        face: (&FontFace, &str),
        paint: &Paint,
        mask: Option<&Mask>,
    ) {
        let size = col.size;
        let (gface, gid) = face;
        let Some(cmds) = self.glyph_outline(gface, gid, g.glyph_id, size) else {
            return;
        };
        let cell_top = col.down_base + g.down;
        let path = build_path(&cmds, col.col_left + g.dx, cell_top + g.dy);
        let transform = if g.rotated {
            let ccx = col.col_left + col.col_w / 2.0;
            let ccy = cell_top + g.advance / 2.0;
            self.transform.pre_concat(rotate_cw90(ccx, ccy))
        } else if g.scale != 1.0 {
            // A tate-chu-yoko combined glyph compressed to its cell: scale about
            // the pen origin (the arrangement already scaled the pen
            // positions), mirroring the PDF backend.
            let (px, py) = (col.col_left + g.dx, cell_top + g.dy);
            self.transform.pre_concat(scale_about(g.scale, px, py))
        } else {
            self.transform
        };
        if let Some(path) = path {
            pixmap.fill_path(&path, paint, FillRule::Winding, transform, mask);
        }
    }
}

/// The face chain `[primary, …present fallbacks]` with each face's id (for
/// the glyph cache), resolved from the `FontStore` (a `&`-reference that
/// outlives the `&mut self` draw calls); an unknown primary is a render
/// error.
fn build_chain<'f>(
    fonts: &'f FontStore,
    font_id: &'f str,
    fallback_ids: &'f [String],
) -> Result<Vec<(&'f FontFace, &'f str)>, RenderPngError> {
    let primary = fonts
        .get(font_id)
        .ok_or_else(|| RenderPngError::UnknownFont(font_id.to_string()))?;
    let mut chain = vec![(primary, font_id)];
    for id in fallback_ids {
        if let Some(f) = fonts.get(id) {
            chain.push((f, id.as_str()));
        }
    }
    Ok(chain)
}

/// The fill paint for a column: solid text color at the block opacity.
fn column_paint(color: (f32, f32, f32), opacity: f32) -> Paint<'static> {
    let mut paint = Paint::default();
    paint.set_color(rgba(color, opacity));
    paint.anti_alias = true;
    paint
}

/// A 90°-clockwise rotation about `(cx, cy)` in y-down pt space
/// (`from_rotate(90)` maps a rightward advance downward), composed with
/// the translate that keeps the center fixed. Mirrors the PDF backend.
fn rotate_cw90(cx: f64, cy: f64) -> Transform {
    Transform::from_row(0.0, 1.0, -1.0, 0.0, (cx + cy) as f32, (cy - cx) as f32)
}

/// A uniform scale about `(px, py)`: translate ∘ scale ∘ untranslate.
/// Mirrors the PDF backend's combined-cell compression.
fn scale_about(s: f64, px: f64, py: f64) -> Transform {
    Transform::from_row(
        s as f32,
        0.0,
        0.0,
        s as f32,
        (px * (1.0 - s)) as f32,
        (py * (1.0 - s)) as f32,
    )
}
