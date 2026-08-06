//! Long-text pagination: a flow text item taller than the flow
//! region splits at the last fitting line and continues page by page,
//! like table rows — instead of warning (`section_overflow`) and drawing
//! over. Only auto-height direct flow children split: a definite `box.h`
//! is the overflow-policy domain, and containers keep atom-unit page
//! breaking. A VERTICAL flow block paginates on its own overflow axis —
//! the width — at column boundaries ([`vertical`]). Decoration and
//! padding are **cloned** onto every fragment (CSS
//! `box-decoration-break: clone` — a sliced border would draw open
//! boxes).

mod vertical;

use crate::boxes::PlacedBox;
use crate::tree::{LayoutItem, TextBlock, TextLine};
use shojiku_core::TextItem;
use shojiku_layout_box::ResolvedBox;

use super::super::flex::h_auto_margin;
use super::super::flow::FlowLayouter;
use super::super::{Atom, Basis, Ctx};
use super::SplitChrome;

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

/// The splittable text block in an atom's items, if it has one. The
/// decoration does NOT come from here — the builder handed it over as
/// paint through [`SplitChrome`], which is what lets a fragment redraw
/// per-side borders and `double` strokes (several rects, or `Line`s for
/// dashed sides) instead of the one rect a walk over items could find.
/// `None` (no `Text` at the top level) keeps the safe non-splitting
/// fallback rather than a panic, and is what makes a `textOverflow: clip`
/// block — whose text is nested in a `Clip` — never split. Both branches
/// execute under the e2e suite alone; engine modules deliberately have no
/// unit tests (a partially-covered second instantiation would trip the
/// 100% gate).
fn split_block(items: &[LayoutItem]) -> Option<TextBlock> {
    items.iter().find_map(|i| {
        if let LayoutItem::Text(t) = i {
            Some(t.clone())
        } else {
            None
        }
    })
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
        self.split_chrome = SplitChrome::default();
        let atom = self.text_atom(text, region);
        self.flow_text = false;
        let anchors = std::mem::take(&mut self.ruby_anchors);
        let chrome = std::mem::take(&mut self.split_chrome);
        let region_h = layouter.region_bottom - layouter.region_top;
        let splitting = !definite_h && atom.height > region_h + 0.01;
        // Readings ride fragments via the anchors channel; a mismatch
        // between the channel and the atom's extra text items (which
        // cannot happen today) declines splitting rather than dropping
        // readings.
        let readings = ruby_readings(&atom.items);
        let carried = anchors.len() == readings.len();
        match (splitting, atom.rb, split_block(&atom.items)) {
            // A vertical block's overflow axis is the WIDTH, never the
            // height: more columns than the box holds continue on the next
            // page in reading order (`vertical`); the height-splitting
            // fragment rebuild below would restack its columns as
            // horizontal rows. A clipped block (its text inside a `Clip`)
            // has no split shape and falls to the atom-unit arm.
            (_, Some(rb), Some(block)) if block.vertical.is_some() && carried => {
                let ruby = RubyCarry { anchors, readings };
                self.place_flow_vertical(
                    atom,
                    (rb, chrome.paint, block),
                    ruby,
                    mark,
                    region,
                    layouter,
                );
            }
            (true, Some(rb), Some(block)) if block.vertical.is_none() && carried => {
                let placement = atom.boxes.first().cloned();
                let ruby = RubyCarry { anchors, readings };
                self.place_fragments(rb, chrome, block, placement, ruby, region, layouter);
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
        chrome: SplitChrome,
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
        // Reserved height `verticalAlign` put around the content (a
        // `minHeight` taller than the text) travels with the edge it was
        // aligned to: the leading slack is the FIRST fragment's extra
        // lead, the trailing slack the LAST fragment's extra tail. Both
        // are zero for the ordinary auto-height block, where every number
        // below is then exactly the pre-slack one.
        let mut lead_i = lead + chrome.slack_top;

        let mut i = 0;
        while i < block.lines.len() {
            // Lines that fit from the current cursor; an exhausted page
            // breaks first so capacity is measured against usable space.
            let mut avail = layouter.region_bottom - layouter.cursor - lead_i - tail;
            if (avail / per_line) < 1.0 && !layouter.fresh_page {
                if !layouter.break_page(&mut self.diags) {
                    return; // page cap hit; `page_overflow` already emitted
                }
                avail = layouter.region_bottom - layouter.cursor - lead_i - tail;
            }
            // At least one line per fragment: a single line taller than
            // the page cannot fit anywhere — `place` warns and moves on,
            // so the loop always advances (no hostile-metrics spin).
            let capacity = ((avail / per_line).floor()).max(0.0) as usize;
            let take = capacity.max(1).min(block.lines.len() - i);
            // Capacity above was measured against the ordinary tail: which
            // fragment is last is only known once `take` is, and a last
            // fragment whose trailing slack no longer fits is placed by
            // `layouter.place` like any other oversized atom.
            let tail_i = if i + take == block.lines.len() {
                tail + chrome.slack_bottom
            } else {
                tail
            };
            let height = lead_i + take as f64 * per_line + tail_i;

            let lines: Vec<TextLine> = block.lines[i..i + take]
                .iter()
                .enumerate()
                .map(|(k, line)| TextLine {
                    text: line.text.clone(),
                    x: line.x,
                    y: lead_i + k as f64 * per_line,
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
            // The whole decoration redrawn at this fragment's height —
            // every border side, `double` stripe and dashed line of it
            // (`box-decoration-break: clone`).
            if let Some(paint) = &chrome.paint {
                paint.emit(
                    &mut items,
                    rb.margin[0],
                    height - rb.margin[0] - rb.margin[2],
                );
            }
            items.push(LayoutItem::Text(TextBlock {
                lines,
                ..block.clone()
            }));
            // This fragment's ruby readings, shifted with their lines
            // (only y moves on a horizontal split).
            items.extend(ruby.for_lines(i, i + take, |j| {
                (0.0, lead_i + (j - i) as f64 * per_line - block.lines[j].y)
            }));
            let fragment = Atom {
                height,
                items,
                boxes,
                rb: Some(rb),
            };
            layouter.place(h_auto_margin(fragment, region), &mut self.diags);
            i += take;
            // Only the first fragment leads with the slack.
            lead_i = lead;
        }
    }
}
