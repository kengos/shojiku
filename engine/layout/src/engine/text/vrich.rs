//! Vertical rich-text blocks: the `spans` counterpart of
//! [`super::rich`] when `writingMode: vertical_rl`. Reuses the horizontal
//! rich span resolution (cascade / `MAX_SPANS` / shared missing-glyph
//! budget / uniform grid) and the orient-aware wrapper — a span carries
//! `RichSpan.orient`, so the SAME greedy/kinsoku/hanging engine breaks
//! columns against the region height. Each wrapped column becomes a
//! right-to-left [`TextLine`] whose [`TextRun`]s carry a per-span style;
//! for a vertical run, `x` is the run's down-offset from the column top
//! and `width` its down-extent (the axes swap, matching the plain
//! vertical block). Overflow parity with the horizontal rich block:
//! `clip` is honored, `shrink`/`ellipsis` warn `span_overflow_unsupported`
//! and behave like `visible`.

use crate::style::ComputedStyle;
use crate::tree::{LayoutItem, TextBlock, TextLine};
use crate::wrap::{wrap_spans_hung, RichSpan};
use shojiku_core::{FontWeight, TextItem, TextOverflow};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::{placed_box, with_vertical_margin, Atom, Basis, Ctx};
use super::height::content_avail;
use super::vcol::{along_offset, column_left, stack_shift};
mod place;
use place::{place_col, PlacedCol};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds a vertical rich item's atom — the spans counterpart of
    /// `rich_text_atom`, same border-box / margin / id handling. The
    /// placement exposes per-column `inspect` metrics like the plain
    /// vertical path.
    pub(super) fn vertical_rich_atom(
        &mut self,
        text: &TextItem,
        basis: &Basis,
        computed: &ComputedStyle,
    ) -> Atom {
        let b = text.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let mut atom = self.vertical_rich_block(
            text,
            computed,
            rb.x,
            w,
            rb.h,
            basis.h.unwrap_or(0.0),
            rb.padding,
        );
        let path = self.current_path();
        let mut pb = placed_box(&path, text.id.as_deref(), &rb, w, atom.height);
        pb.text = self.text_metrics(&atom.items, computed);
        atom.boxes.push(pb);
        let (top, bottom) = (rb.margin[0], rb.margin[2]);
        atom.rb = Some(rb);
        with_vertical_margin(atom, top, bottom)
    }

    /// The wrapped, column-placed vertical rich block. Columns lay
    /// right-to-left from the content box's right edge (shifted as a stack
    /// by the logical `verticalAlign`); more columns than fit run the
    /// `textOverflow` policy against the box WIDTH like the plain block.
    #[allow(clippy::too_many_arguments)] // border box + auto-height basis + padding, like vertical_text_block
    fn vertical_rich_block(
        &mut self,
        text: &TextItem,
        computed: &ComputedStyle,
        x: f64,
        w: f64,
        box_h: Option<f64>,
        avail_h: f64,
        padding: [f64; 4],
    ) -> Atom {
        let orient = computed.text_orientation;
        let block_link = self.resolve_link(text.link.as_ref(), &text.bindings);
        let mut spans = self.resolve_spans(text, computed, block_link.as_deref());
        self.warn_span_glyphs(&spans);
        let grid = self.span_grid(&mut spans, computed);
        // The column WIDTH (cross axis) rides the block's uniform line
        // height, like the horizontal rich line grid.
        let col_width = grid.line_height;
        let trim = computed.text_spacing_trim;

        // The inline extent columns wrap against: the padded content height
        // (definite box), else the region height minus vertical padding. A
        // zero basis (auto-height ancestor) frees the length — one column
        // per paragraph, never a one-char-per-column cascade.
        let mut max_down = match box_h {
            Some(h) => content_avail(h, padding),
            None => (avail_h - padding[0] - padding[2]).max(0.0),
        };
        if max_down <= 0.0 {
            max_down = f64::INFINITY;
        }

        let rich: Vec<RichSpan> = spans
            .iter()
            .map(|s| RichSpan {
                text: &s.content,
                faces: &s.chain.faces,
                size: s.size,
                letter_spacing: s.letter_spacing,
                orient: Some(orient),
                combine: s.combine,
            })
            .collect();
        let columns = wrap_spans_hung(
            &rich,
            max_down,
            computed.line_break,
            computed.hanging_punctuation,
        );

        // Position each column's runs (down-offset from the column top) and
        // measure its inked extent and hung-exclusion alignment basis, so
        // measure and draw share the one `column_extent` basis.
        let positioned: Vec<PlacedCol> = columns
            .iter()
            .map(|col| place_col(&spans, col, orient, trim, col_width))
            .collect();

        let content_x = x + padding[3];
        let content_w = (w - padding[1] - padding[3]).max(0.0);
        let mut clip = false;
        if columns.len() as f64 * col_width > content_w + 0.01 {
            match computed.text_overflow {
                // In a direct flow region the layouter paginates this
                // overflow at column boundaries instead, so the warning is
                // suppressed there — see `super::paginate`.
                TextOverflow::Visible => {
                    // Suppressed only when pagination can actually take
                    // over: a column width no page can hold even one of
                    // (a hostile-huge font) keeps the warning.
                    if !self.flow_text || col_width > content_w + 0.01 {
                        self.warn_columns_overflow(columns.len(), col_width, content_w);
                    }
                }
                TextOverflow::Clip => clip = true,
                // Parity with the horizontal rich block: per-span shrink /
                // ellipsis is not modelled; warn and overflow like visible
                // (which in a direct flow region means paginating).
                TextOverflow::Shrink | TextOverflow::Ellipsis => {
                    self.diags
                        .push(Diagnostic::new(Code::SpanOverflowUnsupported));
                    if !self.flow_text {
                        self.warn_columns_overflow(columns.len(), col_width, content_w);
                    }
                }
            }
        }

        let content_h = positioned
            .iter()
            .map(|p| p.align_extent)
            .fold(0.0, f64::max);
        let block_h = box_h.unwrap_or(content_h + padding[0] + padding[2]);
        // Alignment distributes real slack only: an unconstrained basis (∞)
        // has none, so columns sit at the top.
        let max_down_align = if max_down.is_finite() {
            max_down
        } else {
            content_h
        };
        let shift = stack_shift(
            computed.vertical_align,
            content_w,
            positioned.len() as f64 * col_width,
        );
        let lines: Vec<TextLine> = positioned
            .into_iter()
            .enumerate()
            .map(|(i, p)| TextLine {
                text: p.runs.iter().map(|r| r.text.as_str()).collect(),
                x: column_left(content_x, content_w, col_width, i) - shift,
                y: padding[0] + along_offset(computed.text_align, max_down_align, p.align_extent),
                width: p.extent,
                runs: p.runs,
            })
            .collect();

        let block = LayoutItem::Text(TextBlock {
            font_id: grid.block_chain.primary.face.id.clone(),
            fallback_ids: grid.block_chain.fallback_ids.clone(),
            font_size: grid.block_size,
            line_height: col_width,
            letter_spacing: self.sane_letter_spacing(computed.letter_spacing),
            color: self.color_or_black(computed.color.as_deref()),
            synthetic_bold: computed.font_weight == FontWeight::Bold
                && !grid.block_chain.primary.real_bold,
            // Synthetic italic (a horizontal skew) is meaningless on a
            // rotated / stacked column, like the plain vertical block.
            synthetic_italic: false,
            // Rich decoration is per run; the block-level field would
            // double-draw.
            decoration: None,
            opacity: self.sane_opacity(computed.opacity),
            baseline: None,
            link: None,
            text_spacing_trim: trim,
            vertical: Some(orient),
            // tate-chu-yoko rides each run (`TextRun::combine`); the block-level
            // field describes plain blocks only.
            text_combine: None,
            lines,
        });
        // The box + the split chrome (`super::chrome`); no vertical slack,
        // like the plain vertical builder.
        let items = self.assemble_block(
            block,
            computed,
            super::BlockGeom {
                x,
                w,
                h: block_h,
                clip,
            },
            (0.0, 0.0),
        );
        Atom {
            height: block_h,
            items,
            boxes: Vec::new(),
            rb: None,
        }
    }
}
