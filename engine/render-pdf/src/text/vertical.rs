//! Vertical text drawing for the PDF backend. Each [`TextLine`] is
//! a column; `arrange_vertical` (the shared layout home) decides every
//! glyph's substitution, cell, and cell-relative draw position, so drawing
//! reproduces exactly what layout measured. A plain column draws in the
//! block style; a rich column draws its per-span [`TextRun`]s, each stacked
//! at its own down-offset (`run.x`) in its own font/size/color. This
//! backend only translates each glyph to its column — and rotates a
//! `rotated` cell 90° clockwise about its center.

use super::em_advance;
use crate::draw::solid_fill;
use crate::RenderError;
use krilla::geom::{Point, Transform};
use krilla::surface::Surface;
use krilla::text::{Font, GlyphId, KrillaGlyph};
use shojiku_layout::{arrange_vertical, FontFace, RunOptions, TextBlock, TextOrientation, VGlyph};
use std::collections::HashMap;

type Embedded<'a> = HashMap<String, (&'a FontFace, Font)>;

/// One column's draw inputs: the font chain, its measurement style, the
/// column left / width, and the page-y the column's first cell sits at.
struct Column<'a> {
    chain: Vec<&'a (&'a FontFace, Font)>,
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

/// Draws a vertical block column by column. A plain block draws each line
/// in the block style; a rich block draws each line's runs (per-span
/// font/size/color) stacked at their own down-offsets.
pub(crate) fn draw_text_vertical(
    surface: &mut Surface,
    block: &TextBlock,
    orient: TextOrientation,
    embedded: &Embedded,
) -> Result<(), RenderError> {
    let col_w = block.line_height;
    for line in &block.lines {
        if line.runs.is_empty() {
            let chain = build_chain(&block.font_id, &block.fallback_ids, embedded)?;
            surface.set_fill(Some(solid_fill(block.color, block.opacity)));
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
            draw_column(surface, &col, &line.text);
            // F2 decoration as a SIDE band: one filled rect per column at
            // the layout-resolved x offset, running the column's inked
            // down-extent (matches the horizontal per-line rect).
            if let Some(d) = block.decoration {
                if let Some(path) =
                    crate::draw::rect_path(line.x + d.offset, line.y, d.thickness, line.width)
                {
                    surface.draw_path(&path);
                }
            }
        } else {
            for (i, run) in line.runs.iter().enumerate() {
                let chain = build_chain(&run.font_id, &run.fallback_ids, embedded)?;
                surface.set_fill(Some(solid_fill(run.color, block.opacity)));
                let col = Column {
                    chain,
                    size: run.font_size,
                    opts: RunOptions {
                        letter_spacing: run.letter_spacing,
                        trim: block.text_spacing_trim,
                        line_start: i == 0,
                        // tate-chu-yoko rides the run (span cascade), matching
                        // how layout measured it.
                        combine: run.combine,
                    },
                    col_left: line.x,
                    col_w,
                    down_base: line.y + run.x,
                    orient,
                };
                draw_column(surface, &col, &run.text);
                // Per-run decoration band alongside the run's own extent.
                if let Some(d) = run.decoration {
                    if let Some(path) = crate::draw::rect_path(
                        line.x + d.offset,
                        line.y + run.x,
                        d.thickness,
                        run.width,
                    ) {
                        surface.draw_path(&path);
                    }
                }
            }
        }
    }
    Ok(())
}

/// The face chain `[primary, …present fallbacks]` with each face's krilla
/// font, resolved from an id set; an unknown primary is a render error.
fn build_chain<'a>(
    font_id: &str,
    fallback_ids: &[String],
    embedded: &'a Embedded,
) -> Result<Vec<&'a (&'a FontFace, Font)>, RenderError> {
    let primary = embedded
        .get(font_id)
        .ok_or_else(|| RenderError::UnknownFont(font_id.to_string()))?;
    let mut chain = vec![primary];
    for id in fallback_ids {
        if let Some(e) = embedded.get(id) {
            chain.push(e);
        }
    }
    Ok(chain)
}

/// Arranges `text` down `col` and draws each glyph at its cell.
fn draw_column(surface: &mut Surface, col: &Column, text: &str) {
    let faces: Vec<&FontFace> = col.chain.iter().map(|(f, _)| *f).collect();
    let glyphs = arrange_vertical(&faces, text, col.size, col.orient, col.opts, col.col_w);
    for g in &glyphs {
        let (_, font) = col.chain[g.face_index];
        draw_glyph(surface, col, text, g, font.clone());
    }
}

/// Draws one arranged glyph at its column cell. The arrangement already
/// decided the cell-relative pen position (`dx` from the column left, `dy`
/// from the cell top); a rotated cell is drawn in its pre-rotation frame
/// under a 90°-clockwise transform about the cell center.
fn draw_glyph(surface: &mut Surface, col: &Column, text: &str, g: &VGlyph, font: Font) {
    let size = col.size;
    let cell_top = col.down_base + g.down;
    let kg = KrillaGlyph::new(
        GlyphId::new(g.glyph_id),
        em_advance(g.advance, size) as f32,
        0.0,
        0.0,
        0.0,
        g.source.clone(),
        None,
    );
    let draw = |surface: &mut Surface, x: f64, y: f64| {
        surface.draw_glyphs(
            Point::from_xy(x as f32, y as f32),
            std::slice::from_ref(&kg),
            font.clone(),
            text,
            size as f32,
            false,
        );
    };
    if g.rotated {
        let ccx = col.col_left + col.col_w / 2.0;
        let ccy = cell_top + g.advance / 2.0;
        surface.push_transform(&rotate_cw90(ccx, ccy));
        draw(surface, col.col_left + g.dx, cell_top + g.dy);
        surface.pop();
    } else if g.scale != 1.0 {
        // A tate-chu-yoko combined glyph compressed to its cell: scale about the
        // pen origin (the arrangement already scaled the pen positions).
        let (px, py) = (col.col_left + g.dx, cell_top + g.dy);
        surface.push_transform(&scale_about(g.scale, px, py));
        draw(surface, px, py);
        surface.pop();
    } else {
        draw(surface, col.col_left + g.dx, cell_top + g.dy);
    }
}

/// A uniform scale about `(px, py)`: translate ∘ scale ∘ untranslate.
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

/// A 90°-clockwise rotation about `(cx, cy)` in the y-down page space
/// (`from_rotate(90)` = `from_row(0, 1, -1, 0, …)`, so a rightward advance
/// maps downward), composed with the translate to keep the center fixed.
fn rotate_cw90(cx: f64, cy: f64) -> Transform {
    Transform::from_row(0.0, 1.0, -1.0, 0.0, (cx + cy) as f32, (cy - cx) as f32)
}
