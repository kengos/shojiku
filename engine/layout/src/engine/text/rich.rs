//! Rich text blocks (RT1): resolving `spans` into styled runs on a
//! uniform line grid — one shared baseline and line height per block, so
//! mixed sizes sit on a baseline grid and LT1 pagination keeps its
//! uniform-line capacity math. Produces the same atom shape as
//! [`super::block`], so flow/absolute placement, decoration, and
//! pagination need no changes. Span/style/font resolution lives in
//! [`resolve`], line positioning in [`lines`].

mod lines;
mod resolve;

use crate::style::ComputedStyle;
use crate::tree::{DecorationSpec, LayoutItem, TextBlock, TextLine};
use crate::wrap::{wrap_spans, RichSpan};
use shojiku_core::{FontStyle, FontWeight, TextDecoration, TextItem, TextOverflow};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::{placed_box, with_vertical_margin, Atom, Basis, Ctx};
use super::height::{block_height, content_avail};

/// One span resolved for layout: content, style values (sanity-clamped),
/// and the font chain it measures/draws with. Shared with the vertical
/// rich builder ([`super::vrich`]), so the fields carry `text`-module
/// visibility rather than staying private to this module.
pub(in crate::engine::text) struct SpanRun<'a> {
    pub(in crate::engine::text) content: String,
    pub(in crate::engine::text) chain: crate::font::ResolvedChain<'a>,
    pub(in crate::engine::text) font_id: String,
    pub(in crate::engine::text) size: f64,
    pub(in crate::engine::text) letter_spacing: f64,
    pub(in crate::engine::text) color: (f32, f32, f32),
    pub(in crate::engine::text) synthetic_bold: bool,
    pub(in crate::engine::text) synthetic_italic: bool,
    pub(in crate::engine::text) decoration_kind: TextDecoration,
    /// Filled once the block baseline is known (see `resolve::span_grid`).
    pub(in crate::engine::text) decoration: Option<DecorationSpec>,
    /// Resolved hyperlink for this span's runs (LK1): the span's own
    /// `link`, else the block's (see `resolve::resolve_spans`).
    pub(in crate::engine::text) link: Option<String>,
    /// tate-chu-yoko for this span (`digits N` / `all`), from the span cascade —
    /// consumed by the vertical wrap/arrangement; horizontal paths ignore
    /// it.
    pub(in crate::engine::text) combine: Option<shojiku_core::TextCombine>,
}

/// The block-wide uniform grid: the largest clamped span size drives one
/// line height, and the deepest span ascent one shared baseline. `baseline`
/// is unused by the vertical builder (a column has none), which still shares
/// `block_chain`/`block_size`/`line_height` (the column width).
pub(in crate::engine::text) struct Grid<'a> {
    pub(in crate::engine::text) block_chain: crate::font::ResolvedChain<'a>,
    pub(in crate::engine::text) block_size: f64,
    pub(in crate::engine::text) line_height: f64,
    pub(in crate::engine::text) baseline: f64,
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds a rich text item's atom — the spans counterpart of
    /// `text_atom`, same border-box/margin/id handling.
    pub(super) fn rich_text_atom(&mut self, text: &TextItem, basis: &Basis) -> Atom {
        let b = text.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let computed = self.resolve_style(&text.style_names, &text.style);
        let mut atom = self.rich_block(text, &computed, rb.x, w, rb.h, rb.padding, rb.h_bounds());
        let mut pb = placed_box(
            &self.current_path(),
            text.id.as_deref(),
            &rb,
            w,
            atom.height,
        );
        pb.text = self.text_metrics(&atom.items, &computed);
        atom.boxes.push(pb);
        let (top, bottom) = (rb.margin[0], rb.margin[2]);
        atom.rb = Some(rb);
        with_vertical_margin(atom, top, bottom)
    }

    /// Builds the wrapped, aligned rich block. Overflow policies: v1
    /// honors `visible` and `clip`; `shrink`/`ellipsis` warn and behave
    /// like `visible`.
    #[allow(clippy::too_many_arguments)] // border box + padding + D3 height bounds, like text_block
    fn rich_block(
        &mut self,
        text: &TextItem,
        computed: &ComputedStyle,
        x: f64,
        w: f64,
        box_h: Option<f64>,
        padding: [f64; 4],
        h_bounds: (Option<f64>, Option<f64>),
    ) -> Atom {
        // The block-level link resolves once (one warning, not per span)
        // and reaches every span without its own `link`.
        let block_link = self.resolve_link(text.link.as_ref(), &text.bindings);
        let mut spans = self.resolve_spans(text, computed, block_link.as_deref());
        self.warn_span_glyphs(&spans);
        let grid = self.span_grid(&mut spans, computed);

        let content_x = x + padding[3];
        let content_w = (w - padding[3] - padding[1]).max(0.0);
        let rich: Vec<RichSpan> = spans
            .iter()
            .map(|s| RichSpan {
                text: &s.content,
                faces: &s.chain.faces,
                size: s.size,
                letter_spacing: s.letter_spacing,
                orient: None,
                combine: None,
            })
            .collect();
        let wrapped = wrap_spans(&rich, content_w, computed.line_break);
        let content_h = wrapped.len() as f64 * grid.line_height;

        let avail = box_h.map(|h| content_avail(h, padding));
        let mut clip = false;
        if let Some(avail) = avail {
            if content_h > avail + 0.01 {
                match computed.text_overflow {
                    TextOverflow::Visible => {}
                    // `clip` semantics, like the plain block: reserve
                    // exactly the authored height and clip at its edge.
                    TextOverflow::Clip => clip = true,
                    TextOverflow::Shrink | TextOverflow::Ellipsis => {
                        self.diags
                            .push(Diagnostic::new(Code::SpanOverflowUnsupported));
                    }
                }
            }
        }
        let padded_h = content_h + padding[0] + padding[2];
        let block_h = block_height(box_h, clip, padded_h, h_bounds);
        self.warn_block_overflow(avail, content_h, clip);
        let avail_h = block_h - padding[0] - padding[2];
        let offset = super::valign_offset(computed.vertical_align, padding[0], avail_h, content_h);
        let positioned: Vec<TextLine> = wrapped
            .into_iter()
            .enumerate()
            .map(|(i, pieces)| {
                let y = offset + i as f64 * grid.line_height;
                lines::rich_line(&spans, pieces, computed, content_x, content_w, y)
            })
            .collect();

        let block = LayoutItem::Text(TextBlock {
            font_id: grid.block_chain.primary.face.id.clone(),
            fallback_ids: grid.block_chain.fallback_ids.clone(),
            font_size: grid.block_size,
            line_height: grid.line_height,
            letter_spacing: self.sane_letter_spacing(computed.letter_spacing),
            color: self.color_or_black(computed.color.as_deref()),
            synthetic_bold: computed.font_weight == FontWeight::Bold
                && !grid.block_chain.primary.real_bold,
            synthetic_italic: computed.font_style == FontStyle::Italic
                && !grid.block_chain.primary.real_italic,
            // Rich decoration is per run; the block-level field would
            // only reach empty lines' implicit runs (which draw nothing).
            decoration: None,
            opacity: self.sane_opacity(computed.opacity),
            baseline: Some(grid.baseline),
            // Rich links are per run (span override or block fallback);
            // the block-level field stays unset, like decoration.
            link: None,
            // Trimming is block-level; each run re-shapes with it (interior
            // pairs within a run, and the line-head trim on each line's
            // first run — cross-run pairs are a v1 gap).
            text_spacing_trim: computed.text_spacing_trim,
            // Rich spans are horizontal only in v1 (vertical is plain text).
            vertical: None,
            text_combine: None,
            lines: positioned,
        });
        // The box + the split chrome, exactly as the plain builder does it
        // (`super::chrome` is the one home for both).
        let slack_top = offset - padding[0];
        let items = self.assemble_block(
            block,
            computed,
            super::BlockGeom {
                x,
                w,
                h: block_h,
                clip,
            },
            (slack_top, (block_h - padded_h - slack_top).max(0.0)),
        );
        Atom {
            height: block_h,
            items,
            boxes: Vec::new(),
            rb: None,
        }
    }
}
