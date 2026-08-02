//! One `char_grid` sheet's atom: background fill, the stroked cell
//! grid, and the per-cell text blocks. Ruby runs ride along from
//! [`super::ruby`]. A horizontal sheet's cells share one horizontal
//! block; a vertical sheet's cells are one-cell COLUMNS of a vertical
//! block, so the renderers shape them with real GSUB `vert` (`ー` and
//! brackets rotate as the font intends, `、。` sit where its vert glyphs
//! place them). Emits only rects + text blocks — renderers never change.

use shojiku_core::{CharGridItem, FontStyle, FontWeight, TextOrientation, TextSpacingTrim};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::{placed_box, with_vertical_margin, Atom, Ctx};
use super::cells::CellChar;
use super::glyph::{self, CellFrame};
use super::GridPrep;
use crate::tree::{LayoutItem, RectShape, TextBlock, TextLine};

/// Block-level paint shared by the main block and its ruby blocks.
pub(super) struct BlockPaint {
    pub font_id: String,
    pub fallback_ids: Vec<String>,
    pub color: (f32, f32, f32),
    pub synthetic_bold: bool,
    pub synthetic_italic: bool,
    pub opacity: f32,
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds sheet `sheet` (0-based) of a prepared grid as one atom.
    pub(super) fn sheet_atom(
        &mut self,
        item: &CharGridItem,
        prep: &GridPrep,
        sheet: usize,
    ) -> Atom {
        let geom = &prep.geom;
        let rb = &prep.rb;
        let (origin_x, top) = (rb.content_x(), rb.padding[0]);
        let height = rb.h.unwrap_or(geom.sheet_h() + rb.v_padding());
        let opacity = self.sane_opacity(prep.computed.opacity);
        let mut items = Vec::new();

        if let Some(fill) = self.background_fill(prep.computed.background_color.as_deref()) {
            items.push(LayoutItem::Rect(RectShape {
                x: origin_x,
                y: top,
                w: geom.grid_w(),
                h: geom.sheet_h(),
                stroke: None,
                stroke_width: 0.0,
                fill: Some(fill),
                opacity,
                ..Default::default()
            }));
        }
        self.push_grid_rects(&mut items, prep, origin_x, top, opacity);

        let resolved = self.resolved_chain(&prep.computed);
        let faces = resolved.faces.clone();
        let paint = BlockPaint {
            font_id: resolved.primary.face.id.clone(),
            fallback_ids: resolved.fallback_ids.clone(),
            color: self.color_or_black(prep.computed.color.as_deref()),
            synthetic_bold: prep.computed.font_weight == FontWeight::Bold
                && !resolved.primary.real_bold,
            synthetic_italic: prep.computed.font_style == FontStyle::Italic
                && !resolved.primary.real_italic,
            opacity,
        };

        let (lo, hi) = (sheet * geom.lines, (sheet + 1) * geom.lines);
        let frame = CellFrame {
            geom,
            base_size: prep.font_size,
            lo,
            origin_x,
            top,
            faces: &faces,
            combine: prep.combine,
        };
        let mut lines: Vec<TextLine> = Vec::new();
        for cell in prep.cells.iter().filter(|c| (lo..hi).contains(&c.line)) {
            let g = match geom.vertical {
                true => glyph::cell_column(cell, &frame),
                false => glyph::cell_glyph(cell, &frame),
            };
            // large-writing blocks draw larger than a cell, so each rides its own
            // text block; ordinary cells share one block at the base size.
            match cell.scale {
                1 => lines.push(g.line),
                _ => items.push(cell_block(&paint, g.size, g.col_w, prep, vec![g.line])),
            }
        }
        if sheet == 0 {
            self.warn_grid_missing_glyphs(prep, &faces, &paint.font_id);
        }
        items.push(cell_block(&paint, prep.font_size, geom.cell, prep, lines));
        self.push_ruby(&mut items, prep, sheet, &faces, &paint);

        let boxes = vec![placed_box(
            &self.current_path(),
            item.id.as_deref(),
            rb,
            prep.w,
            height,
        )];
        with_vertical_margin(
            Atom {
                height,
                items,
                boxes,
                rb: Some(*rb),
            },
            rb.margin[0],
            rb.margin[2],
        )
    }

    /// Strokes one rect per cell. The grid line width is the authored
    /// `borderWidth` (scalar; a map's top side) — unset defaults to
    /// 0.5pt, `0` turns the grid off.
    fn push_grid_rects(
        &mut self,
        items: &mut Vec<LayoutItem>,
        prep: &GridPrep,
        origin_x: f64,
        top: f64,
        opacity: f32,
    ) {
        let geom = &prep.geom;
        let width = prep.grid_border.unwrap_or(0.5);
        if width <= 0.0 {
            return;
        }
        let stroke = Some(self.color_or_black(prep.computed.border_colors[0].as_deref()));
        for line in 0..geom.lines {
            for pos in 0..geom.cpl {
                let (cx, cy) = geom.cell_origin(line, pos);
                items.push(LayoutItem::Rect(RectShape {
                    x: origin_x + cx,
                    y: top + cy,
                    w: geom.cell,
                    h: geom.cell,
                    stroke,
                    stroke_width: width,
                    fill: None,
                    opacity,
                    ..Default::default()
                }));
            }
        }
    }

    /// One `missing_glyph` warning per item over every placed char. The
    /// AUTHORED chars are scanned — vertical presentation is a GSUB
    /// substitution of the same base glyph on the shaped path, and the
    /// degrade path substitutes a form only when a chain face covers it.
    fn warn_grid_missing_glyphs(
        &mut self,
        prep: &GridPrep,
        faces: &[&crate::font::FontFace],
        font_id: &str,
    ) {
        let drawn: String = prep.cells.iter().map(CellChar::text).collect();
        let mut missing = String::new();
        let truncated = super::super::text::collect_missing(&drawn, faces, &mut missing);
        if !missing.is_empty() {
            let ellipsis = if truncated { " …" } else { "" };
            self.diags.push(
                Diagnostic::new(Code::MissingGlyph)
                    .arg("font", font_id)
                    .arg("chars", format!("{missing}{ellipsis}")),
            );
        }
    }
}

/// A plain HORIZONTAL text block in the shared paint at `size` — cells of
/// a horizontal grid, and horizontal ruby readings.
pub(super) fn text_block(paint: &BlockPaint, size: f64, lines: Vec<TextLine>) -> LayoutItem {
    LayoutItem::Text(TextBlock {
        font_id: paint.font_id.clone(),
        fallback_ids: paint.fallback_ids.clone(),
        font_size: size,
        line_height: size,
        letter_spacing: 0.0,
        color: paint.color,
        synthetic_bold: paint.synthetic_bold,
        synthetic_italic: paint.synthetic_italic,
        decoration: None,
        opacity: paint.opacity,
        baseline: None,
        link: None,
        // One char per cell — no adjacent-punctuation trimming applies.
        text_spacing_trim: TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines,
    })
}

/// A VERTICAL text block whose lines are one-cell columns `col_w` wide:
/// vertical grid cells (upright, so the renderers shape with GSUB `vert`)
/// and vertical ruby readings.
pub(super) fn vertical_block(
    paint: &BlockPaint,
    size: f64,
    col_w: f64,
    combine: Option<u8>,

    lines: Vec<TextLine>,
) -> LayoutItem {
    LayoutItem::Text(TextBlock {
        font_id: paint.font_id.clone(),
        fallback_ids: paint.fallback_ids.clone(),
        font_size: size,
        line_height: col_w,
        letter_spacing: 0.0,
        color: paint.color,
        synthetic_bold: paint.synthetic_bold,
        synthetic_italic: paint.synthetic_italic,
        decoration: None,
        opacity: paint.opacity,
        baseline: None,
        link: None,
        text_spacing_trim: TextSpacingTrim::SpaceAll,
        vertical: Some(TextOrientation::Upright),
        // char_grid combines digit RUNS only (`all` never reaches here).
        text_combine: combine.map(shojiku_core::TextCombine::Digits),
        lines,
    })
}

/// The per-cell block for one sheet: horizontal cells share the
/// horizontal shape, vertical cells become one-cell columns.
fn cell_block(
    paint: &BlockPaint,
    size: f64,
    col_w: f64,
    prep: &GridPrep,
    lines: Vec<TextLine>,
) -> LayoutItem {
    match prep.geom.vertical {
        true => vertical_block(paint, size, col_w, prep.combine, lines),
        false => text_block(paint, size, lines),
    }
}
