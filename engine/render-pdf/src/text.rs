//! Text drawing for the PDF backend: the fallback-chain glyph runs and
//! the krilla glyph mapping. `FontFace` decided every glyph id, advance,
//! and fallback face; layout decided every run's font/color/decoration
//! (`TextBlock::line_runs` — plain lines yield one implicit run, rich
//! lines their spans). This only groups glyphs into per-face runs (krilla
//! draws one font per call) and converts advances to em units.

#[cfg(test)]
mod tests;
mod vertical;

use crate::draw::{solid_fill, solid_stroke};
use crate::RenderError;
use krilla::geom::{Point, Transform};
use krilla::surface::Surface;
use krilla::text::{Font, GlyphId, KrillaGlyph};
use shojiku_layout::{shape_run, FontFace, PositionedGlyph, RunView, TextBlock};
use std::collections::HashMap;

/// Draws one text block run by run: each run picks its own font chain,
/// fill, synthetic effects, and decoration; all runs of a line sit on
/// the block's baseline (layout-computed for rich blocks, the primary
/// ascent for plain ones). A vertical block takes the column path.
pub(crate) fn draw_text(
    surface: &mut Surface,
    block: &TextBlock,
    embedded: &HashMap<String, (&FontFace, Font)>,
) -> Result<(), RenderError> {
    if let Some(orient) = block.vertical {
        return vertical::draw_text_vertical(surface, block, orient, embedded);
    }
    let primary = embedded
        .get(&block.font_id)
        .ok_or_else(|| RenderError::UnknownFont(block.font_id.clone()))?;
    let base = block.baseline_offset(primary.0.ascent(block.font_size));
    for line in &block.lines {
        for run in block.line_runs(line) {
            if run.text.is_empty() {
                continue;
            }
            draw_run(surface, &run, line.y, base, block.opacity, embedded)?;
        }
    }
    Ok(())
}

/// Draws one run at `line_y + base` (the baseline): fallback-chain glyphs
/// grouped into consecutive same-face segments, then the run's decoration
/// rect in the same fill.
fn draw_run(
    surface: &mut Surface,
    run: &RunView<'_>,
    line_y: f64,
    base: f64,
    opacity: f32,
    embedded: &HashMap<String, (&FontFace, Font)>,
) -> Result<(), RenderError> {
    let primary = embedded
        .get(run.font_id)
        .ok_or_else(|| RenderError::UnknownFont(run.font_id.to_string()))?;
    // Chain: primary + present fallback faces (with their krilla fonts).
    let mut chain: Vec<&(&FontFace, Font)> = vec![primary];
    for id in run.fallback_ids {
        if let Some(e) = embedded.get(id) {
            chain.push(e);
        }
    }
    let faces: Vec<&FontFace> = chain.iter().map(|(f, _)| *f).collect();
    let baseline_y = line_y + base;
    surface.set_fill(Some(solid_fill(run.color, opacity)));
    // Synthetic bold: krilla strokes + fills glyphs in one pass
    // (PDF fill-then-stroke text rendering); advances unchanged.
    surface.set_stroke(
        run.synthetic_bold
            .then(|| solid_stroke(run.color, run.synthetic_bold_stroke_width(), opacity)),
    );
    // Synthetic italic: skew about the baseline, per run.
    if run.synthetic_italic {
        surface.push_transform(&italic_skew(baseline_y));
    }
    // `RunView::options` carries trim + line_start exactly as layout
    // measured this run — never rebuild them here.
    let glyphs = shape_run(&faces, run.text, run.font_size, run.options());
    let mut i = 0;
    while i < glyphs.len() {
        let fi = glyphs[i].face_index;
        let start_x = glyphs[i].x;
        let run_len = glyphs[i..]
            .iter()
            .take_while(|g| g.face_index == fi)
            .count();
        let mapped = map_glyphs(&glyphs[i..i + run_len], run.font_size);
        i += run_len;
        surface.draw_glyphs(
            Point::from_xy((run.x + start_x) as f32, baseline_y as f32),
            &mapped,
            chain[fi].1.clone(),
            run.text,
            run.font_size as f32,
            false,
        );
    }
    if run.synthetic_italic {
        surface.pop();
    }
    surface.set_stroke(None);
    // `textDecoration` on a span run: one filled rect per run in its fill,
    // drawn unskewed even under synthetic italic (matching how browsers
    // underline faux-italic text). Layout precomputed offset/thickness
    // relative to the line top.
    if let Some(d) = run.decoration {
        if let Some(path) = crate::draw::rect_path(run.x, line_y + d.offset, run.width, d.thickness)
        {
            surface.draw_path(&path);
        }
    }
    Ok(())
}

/// Adapts positioned glyphs into krilla glyphs. All placement/fallback
/// policy (advance incl. letter spacing, `.notdef` for unmapped chars, the
/// face each glyph came from) was decided by the font layer; this only
/// converts the advance to em units (font-size 1.0 = pt advance / size).
/// krilla's own shaping is deliberately unused — it would pull the
/// unmaintained ttf-parser back in and could kern away from the reserved
/// width.
pub(crate) fn map_glyphs(glyphs: &[PositionedGlyph], size: f64) -> Vec<KrillaGlyph> {
    glyphs
        .iter()
        .map(|g| {
            // The run Point is the first glyph's pen `x`; each glyph carries
            // its own shaper positioning offset (0 for kerning/ligatures).
            // `PositionedGlyph.y_offset` is layout y-down; krilla expects
            // the HarfBuzz convention (positive = upward — its content
            // stream computes `cur_y - y_offset`), so flip the sign at
            // this layout→krilla boundary.
            KrillaGlyph::new(
                GlyphId::new(g.glyph_id),
                em_advance(g.advance, size) as f32,
                em_advance(g.x_offset, size) as f32,
                em_advance(-g.y_offset, size) as f32,
                0.0,
                g.source.clone(),
                None,
            )
        })
        .collect()
}

/// Normalizes a pt advance to em units (krilla's glyph advance space).
/// A non-positive size cannot occur for a laid-out block (layout clamps
/// font sizes), but guard the division rather than emit a non-finite
/// advance from a hand-built tree.
pub(crate) fn em_advance(advance_pt: f64, size: f64) -> f64 {
    if size > 0.0 {
        advance_pt / size
    } else {
        0.0
    }
}

/// Skew transform for synthetic italic: leans glyph tops rightward by the
/// layout-owned [`TextBlock::SYNTHETIC_ITALIC_SKEW`] factor while keeping
/// the given baseline fixed (y-down: points above the baseline have
/// smaller y, so the skew coefficient is negated).
pub(crate) fn italic_skew(baseline_y: f64) -> Transform {
    let k = TextBlock::SYNTHETIC_ITALIC_SKEW;
    Transform::from_row(1.0, 0.0, -k as f32, 1.0, (k * baseline_y) as f32, 0.0)
}
