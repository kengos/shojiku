//! Vertical column pagination: a flow vertical-writing block needing more columns
//! than its box width holds continues on the NEXT page (fragments of
//! whole columns, right-to-left reading order preserved) instead of
//! extending left past the box. Only the visible-behaving overflow
//! paginates — `clip` hides its block inside a `Clip` (no split shape, so
//! the router never sends it here), `shrink`/`ellipsis` resolve the
//! overflow in the builder, and a `shrink` still overflowing at its floor
//! warned `vertical_text_overflow` (the marker this module checks) and
//! places whole. The marker is the vertical case's OWN code, so an
//! unrelated overflow landing in the same window cannot trip it.

use crate::boxes::PlacedBox;
use crate::tree::{LayoutItem, TextBlock, TextLine};
use shojiku_diagnostics::DiagnosticCode as Code;
use shojiku_layout_box::ResolvedBox;

use super::super::super::decoration::DecorationPaint;
use super::super::super::flex::h_auto_margin;
use super::super::super::flow::FlowLayouter;
use super::super::super::{Atom, Basis, Ctx};
use super::super::metrics::vertical_metrics;
use super::RubyCarry;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Places a vertical flow atom: paginated at column boundaries when
    /// its columns overflow the content width and no policy handled the
    /// overflow (a `vertical_text_overflow` warned at or after `mark` —
    /// the shrink-at-floor case), else whole. `parts` are the atom's split
    /// clones (the router already destructured them); the content box is
    /// re-derived from the resolved box + region exactly as the builder
    /// derived it, so the two cannot disagree.
    pub(super) fn place_flow_vertical(
        &mut self,
        atom: Atom,
        parts: (ResolvedBox, Option<DecorationPaint>, TextBlock),
        ruby: RubyCarry,
        mark: usize,
        region: &Basis,
        layouter: &mut FlowLayouter,
    ) {
        let (rb, paint, block) = parts;
        let content_x = rb.x + rb.padding[3];
        let content_w = (rb.w_or_fill(region, 1.0) - rb.padding[1] - rb.padding[3]).max(0.0);
        let needed = block.lines.len() as f64 * block.line_height;
        let handled = self.diags.items[mark..]
            .iter()
            .any(|d| d.code == Code::VerticalTextOverflow);
        if needed <= content_w + 0.01 || handled {
            layouter.place(h_auto_margin(atom, region), &mut self.diags);
            return;
        }
        let placement = atom.boxes.first().cloned();
        self.place_column_fragments(
            VerticalFragments {
                paint,
                block,
                placement,
                height: atom.height,
                content: (content_x, content_w),
                ruby,
            },
            rb,
            region,
            layouter,
        );
    }

    /// Splits the block's columns into per-page fragments of `cap` whole
    /// columns, each re-laid from its own page's right edge; every
    /// fragment after the first starts a fresh page (columns READ across
    /// pages — stacking two fragments on one page would break the
    /// right-to-left order). Stops at the page cap (`break_page` warned
    /// `page_overflow`).
    fn place_column_fragments(
        &mut self,
        f: VerticalFragments,
        rb: ResolvedBox,
        region: &Basis,
        layouter: &mut FlowLayouter,
    ) {
        let col_w = f.block.line_height;
        let (content_x, content_w) = f.content;
        // `line_height` is sanity-clamped positive and `content_w` finite,
        // so the cap is well-defined; at least one column per page keeps
        // the loop advancing on any hostile ratio.
        let cap = ((content_w / col_w).floor().max(1.0)) as usize;
        let chunks: Vec<&[TextLine]> = f.block.lines.chunks(cap).collect();
        for (k, chunk) in chunks.iter().enumerate() {
            if k > 0 && !layouter.break_page(&mut self.diags) {
                return; // page cap hit; `page_overflow` already emitted
            }
            let lines: Vec<TextLine> = chunk
                .iter()
                .enumerate()
                .map(|(j, line)| TextLine {
                    text: line.text.clone(),
                    // Column j of this fragment steps left from the
                    // content box's right edge, like the builder.
                    x: content_x + content_w - (j as f64 + 1.0) * col_w,
                    y: line.y,
                    width: line.width,
                    // Rich runs ride the fragment (their x/width are
                    // column-relative down-offsets; only the column moved).
                    runs: line.runs.clone(),
                })
                .collect();
            let fblock = TextBlock {
                lines,
                ..f.block.clone()
            };
            let mut items = Vec::with_capacity(2);
            // This fragment's ruby readings, shifted with their columns
            // (only x moves on a column split).
            let lo = k * cap;
            let ruby_items = f.ruby.for_lines(lo, lo + chunk.len(), |j| {
                let new_x = content_x + content_w - ((j - lo) as f64 + 1.0) * col_w;
                (new_x - f.block.lines[j].x, 0.0)
            });
            if let Some(paint) = &f.paint {
                // Redrawn whole per fragment (box-decoration-break: clone).
                // Every column fragment keeps the box's full height, so the
                // geometry is the block's own — unlike the horizontal
                // split, which redraws at each fragment's height.
                paint.emit(
                    &mut items,
                    rb.margin[0],
                    f.height - rb.margin[0] - rb.margin[2],
                );
            }
            // Each fragment carries its own placement with per-column
            // metrics rebuilt for ITS columns (pure over the block fields).
            let boxes: Vec<PlacedBox> = f
                .placement
                .iter()
                .map(|p| {
                    let mut frag = p.clone();
                    frag.text = Some(vertical_metrics(&fblock));
                    frag
                })
                .collect();
            items.push(LayoutItem::Text(fblock));
            items.extend(ruby_items);
            let fragment = Atom {
                height: f.height,
                items,
                boxes,
                rb: Some(rb),
            };
            layouter.place(h_auto_margin(fragment, region), &mut self.diags);
        }
    }
}

/// One vertical block's split parts, bundled so the fragment loop's
/// signature stays flat.
struct VerticalFragments {
    /// The block's decoration as replayable paint — redrawn whole per
    /// fragment (`box-decoration-break: clone`), so per-side borders and
    /// `double` strokes survive a column split.
    paint: Option<DecorationPaint>,
    block: TextBlock,
    placement: Option<PlacedBox>,
    height: f64,
    /// Content-box `(x, w)` in atom coordinates — the same basis the
    /// builder stepped columns from.
    content: (f64, f64),
    /// The block's ruby readings + their owning columns, re-anchored per
    /// fragment.
    ruby: RubyCarry,
}
