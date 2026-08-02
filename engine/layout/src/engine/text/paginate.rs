//! Long-text pagination (LT1): a flow text item taller than the flow
//! region splits at the last fitting line and continues page by page,
//! like table rows — instead of warning (`section_overflow`) and drawing
//! over. Only auto-height direct flow children split: a definite `box.h`
//! is the T1 overflow-policy domain, and containers keep atom-unit page
//! breaking. A VERTICAL flow block paginates on its own overflow axis —
//! the width — at column boundaries ([`vertical`]). Decoration and
//! padding are **cloned** onto every fragment (CSS
//! `box-decoration-break: clone` — a sliced border would draw open
//! boxes).

mod vertical;

use crate::boxes::PlacedBox;
use crate::tree::{LayoutItem, RectShape, TextBlock, TextLine};
use shojiku_core::TextItem;
use shojiku_layout_box::ResolvedBox;

use super::super::flex::h_auto_margin;
use super::super::flow::FlowLayouter;
use super::super::{Atom, Basis, Ctx};

/// The ruby readings a splitting flow text atom carries: each reading
/// block (one line each) paired with its owning line/column index (the
/// `Ctx::ruby_anchors` channel), so a fragment re-anchors ITS lines'
/// readings instead of dropping them. Empty for ruby-less items.
pub(super) struct RubyCarry {
    pub(super) anchors: Vec<usize>,
    pub(super) readings: Vec<TextBlock>,
}

impl RubyCarry {
    /// The readings owned by lines `[lo, hi)`, re-anchored by
    /// `shift(line_index) -> (dx, dy)` — the fragment's line movement.
    pub(super) fn for_lines(
        &self,
        lo: usize,
        hi: usize,
        shift: impl Fn(usize) -> (f64, f64),
    ) -> Vec<LayoutItem> {
        let mut out = Vec::new();
        for (i, reading) in self.anchors.iter().zip(&self.readings) {
            if !(lo..hi).contains(i) {
                continue;
            }
            let (dx, dy) = shift(*i);
            let mut block = reading.clone();
            for line in &mut block.lines {
                line.x += dx;
                line.y += dy;
            }
            out.push(LayoutItem::Text(block));
        }
        out
    }
}

/// The reading blocks a ruby'd text atom carries: every top-level `Text`
/// AFTER the first (the main block — the assembly contract), cloned in
/// order (matching `Ctx::ruby_anchors`).
fn ruby_readings(items: &[LayoutItem]) -> Vec<TextBlock> {
    items
        .iter()
        .filter_map(|i| {
            if let LayoutItem::Text(t) = i {
                Some(t.clone())
            } else {
                None
            }
        })
        .skip(1)
        .collect()
}

/// Destructures a text atom's items into the parts a fragment rebuild
/// needs: the (first) decoration rect and the text block. This is the
/// consuming end of the assembly CONTRACT in `block.rs`/`rich.rs`
/// (decoration `Rect`s first, the `Text` block last; a `Clip` wrapper
/// only exists under a definite height, which never splits) — change
/// both ends together. `None` (no `Text` at the top level) keeps the
/// safe non-splitting fallback rather than a panic. Both branches of
/// each walk execute under the e2e suite alone (decorated atoms visit
/// Rect→non-match and Text→match) — engine modules deliberately have no
/// unit tests (a partially-covered second instantiation would trip the
/// 100% gate). Known limitation, to be fixed with the
/// typed-splittability rework: only
/// the FIRST rect is carried, so per-side borders (several rects) lose
/// their remaining sides on split, and fragments re-derive line ys from
/// the top (a `minHeight` + middle/bottom valign offset is dropped).
fn split_parts(items: &[LayoutItem]) -> Option<(Option<RectShape>, TextBlock)> {
    let deco = items.iter().find_map(|i| {
        if let LayoutItem::Rect(r) = i {
            Some(r.clone())
        } else {
            None
        }
    });
    let block = items.iter().find_map(|i| {
        if let LayoutItem::Text(t) = i {
            Some(t.clone())
        } else {
            None
        }
    });
    block.map(|b| (deco, b))
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Places a flow text item, splitting it across pages when its
    /// auto-height block is taller than the whole flow region. Anything
    /// that fits a page (or has a definite height) keeps the atom-unit
    /// placement, as does an atom without the `text_atom` shape (an
    /// attached `ResolvedBox` and a trailing text block) — which cannot
    /// happen today and stays the safe fallback rather than a panic.
    pub(in crate::engine) fn place_flow_text(
        &mut self,
        text: &TextItem,
        region: &Basis,
        layouter: &mut FlowLayouter,
    ) {
        let definite_h = text.box_.as_ref().is_some_and(|b| b.h.is_some());
        // Mark the diagnostics high-water so the vertical arm can tell a
        // policy-handled overflow (shrink at its floor warned) from a
        // visible-behaving one (suppressed under `flow_text`) — only the
        // latter paginates.
        let mark = self.diags.len();
        self.flow_text = true;
        self.ruby_anchors.clear();
        let atom = self.text_atom(text, region);
        self.flow_text = false;
        let anchors = std::mem::take(&mut self.ruby_anchors);
        let region_h = layouter.region_bottom - layouter.region_top;
        let splitting = !definite_h && atom.height > region_h + 0.01;
        // Readings ride fragments via the anchors channel; a mismatch
        // between the channel and the atom's extra text items (which
        // cannot happen today) declines splitting rather than dropping
        // readings.
        let readings = ruby_readings(&atom.items);
        let carried = anchors.len() == readings.len();
        match (splitting, atom.rb, split_parts(&atom.items)) {
            // A vertical block's overflow axis is the WIDTH, never the
            // height: more columns than the box holds continue on the next
            // page in reading order (`vertical`); the height-splitting
            // fragment rebuild below would restack its columns as
            // horizontal rows. A clipped block (its text inside a `Clip`)
            // has no split shape and falls to the atom-unit arm.
            (_, Some(rb), Some((deco, block))) if block.vertical.is_some() && carried => {
                let ruby = RubyCarry { anchors, readings };
                self.place_flow_vertical(atom, (rb, deco, block), ruby, mark, region, layouter);
            }
            (true, Some(rb), Some((deco, block))) if block.vertical.is_none() && carried => {
                let placement = atom.boxes.first().cloned();
                let ruby = RubyCarry { anchors, readings };
                self.place_fragments(rb, deco, block, placement, ruby, region, layouter);
            }
            _ => layouter.place(h_auto_margin(atom, region), &mut self.diags),
        }
    }

    /// Splits an oversized auto-height text block into per-page
    /// fragments: fill the space left on the current page, then whole
    /// pages of lines, like table rows.
    #[allow(clippy::too_many_arguments)] // one deconstructed text atom, not independent knobs
    fn place_fragments(
        &mut self,
        rb: ResolvedBox,
        deco: Option<RectShape>,
        block: TextBlock,
        placement: Option<PlacedBox>,
        ruby: RubyCarry,
        region: &Basis,
        layouter: &mut FlowLayouter,
    ) {
        // Vertical chrome cloned onto every fragment: top/bottom margin +
        // padding (already folded into the atom's line ys and height).
        let lead = rb.margin[0] + rb.padding[0];
        let tail = rb.margin[2] + rb.padding[2];
        let per_line = block.line_height;

        let mut i = 0;
        while i < block.lines.len() {
            // Lines that fit from the current cursor; an exhausted page
            // breaks first so capacity is measured against usable space.
            let mut avail = layouter.region_bottom - layouter.cursor - lead - tail;
            if (avail / per_line) < 1.0 && !layouter.fresh_page {
                if !layouter.break_page(&mut self.diags) {
                    return; // page cap hit; `page_overflow` already emitted
                }
                avail = layouter.region_bottom - layouter.cursor - lead - tail;
            }
            // At least one line per fragment: a single line taller than
            // the page cannot fit anywhere — `place` warns and moves on,
            // so the loop always advances (no hostile-metrics spin).
            let capacity = ((avail / per_line).floor()).max(0.0) as usize;
            let take = capacity.max(1).min(block.lines.len() - i);
            let height = lead + take as f64 * per_line + tail;

            let lines: Vec<TextLine> = block.lines[i..i + take]
                .iter()
                .enumerate()
                .map(|(k, line)| TextLine {
                    text: line.text.clone(),
                    x: line.x,
                    y: lead + k as f64 * per_line,
                    width: line.width,
                    // Rich runs ride the fragment (their x/width are
                    // line-relative already; only y moved).
                    runs: line.runs.clone(),
                })
                .collect();
            // Each fragment carries its own placement (like a repeated
            // id: once per instance), sized to the fragment, with line
            // metrics rebuilt for ITS lines (the whole-block list would
            // report stale count/ys on pages 2+ — the vertical splitter's
            // per-fragment rebuild, mirrored).
            let boxes = placement
                .iter()
                .map(|p| {
                    let mut frag = p.clone();
                    frag.border.h = height - rb.margin[0] - rb.margin[2];
                    frag.content.h = frag.border.h - rb.padding[0] - rb.padding[2];
                    frag.text = super::metrics::fragment_metrics(p.text.as_ref(), &block, &lines);
                    frag
                })
                .collect();
            let mut items = Vec::with_capacity(2);
            if let Some(d) = &deco {
                items.push(LayoutItem::Rect(RectShape {
                    y: rb.margin[0],
                    h: height - rb.margin[0] - rb.margin[2],
                    ..d.clone()
                }));
            }
            items.push(LayoutItem::Text(TextBlock {
                lines,
                ..block.clone()
            }));
            // This fragment's ruby readings, shifted with their lines
            // (only y moves on a horizontal split).
            items.extend(ruby.for_lines(i, i + take, |j| {
                (0.0, lead + (j - i) as f64 * per_line - block.lines[j].y)
            }));
            let fragment = Atom {
                height,
                items,
                boxes,
                rb: Some(rb),
            };
            layouter.place(h_auto_margin(fragment, region), &mut self.diags);
            i += take;
        }
    }
}
