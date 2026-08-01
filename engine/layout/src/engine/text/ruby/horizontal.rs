//! The horizontal ruby applier: readings as small horizontal blocks
//! centered ABOVE their base run's em band, shrunk to the run's shaped
//! width with the print floor, split proportionally when the base wraps
//! across lines. Handles plain AND rich (`spans`) blocks. The engine's
//! fixed-leading model never grows the line box for a reading — the
//! documented convention is an authored `lineHeight` ≳ 1.5 so the
//! reading band has room (a first-line reading may extend above the
//! block's border box, like a vertical reading extends beside it).

use std::collections::HashMap;

use shojiku_core::TextItem;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::super::{Atom, Basis, Ctx};
use super::{fit, match_entries, push_ruby_items, slice_extent, Cell, MIN_RUBY_PT};
use crate::font::{run_width, RunOptions};
use crate::style::ComputedStyle;
use crate::tree::{LayoutItem, TextBlock, TextLine};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Attaches the item's ruby readings above a finished horizontal
    /// block atom (plain or rich). The block is final (post
    /// shrink/ellipsis/clip), so bases are matched against exactly what
    /// will be drawn. Records each reading's owning line in
    /// `ruby_anchors` (the flow paginator's re-anchoring channel).
    pub(in crate::engine::text) fn apply_horizontal_ruby(
        &mut self,
        atom: &mut Atom,
        text: &TextItem,
        computed: &ComputedStyle,
        basis: &Basis,
    ) {
        let block = super::super::find_text_block(&atom.items).cloned();
        let Some(block) = block else { return };
        let resolved = self.resolved_chain(computed);
        let line_texts: Vec<String> = block.lines.iter().map(|l| l.text.clone()).collect();
        // The preferred reading size: the authored `rubySize`, else half
        // the block's final font size (the JLREQ convention).
        let preferred = match self.resolve_x(text.ruby_size, basis) {
            Some(r) if r.is_finite() && r > 0.0 => r,
            _ => block.font_size / 2.0,
        };

        let matches = match_entries(&line_texts, &text.ruby, &mut self.diags);
        let mut cells: HashMap<usize, Vec<Cell>> = HashMap::new();
        let mut overflowed = false;
        let mut ruby_items: Vec<LayoutItem> = Vec::new();
        for m in matches {
            let line = &block.lines[m.line];
            let line_cells = cells
                .entry(m.line)
                .or_insert_with(|| self.horizontal_cells(&block, line));
            let Some(se) = slice_extent(line_cells, &m.range) else { continue };
            // Shrink the reading to its base run (widths are linear in
            // size), floored for readability.
            let measure = |s: f64| {
                run_width(
                    &resolved.faces,
                    &m.reading,
                    s,
                    RunOptions::spacing_only(0.0),
                )
            };
            let mut size = preferred;
            let mut read_w = measure(size);
            if read_w > se.extent && read_w > 0.0 {
                size = fit(size, size * se.extent / read_w);
                read_w = measure(size);
            }
            overflowed |= read_w > se.extent + 0.01;
            self.ruby_anchors.push(m.line);
            ruby_items.push(ruby_line_block(
                &block,
                &resolved.fallback_ids,
                size,
                TextLine {
                    text: m.reading,
                    // Centered over the base run's shaped extent, its
                    // bottom touching the run's em top (char_grid's
                    // horizontal convention).
                    x: se.at + (se.extent - read_w) / 2.0,
                    y: line.y + se.top - size,
                    width: read_w,
                    runs: Vec::new(),
                },
            ));
        }
        if overflowed {
            self.diags
                .push(Diagnostic::new(Code::RubyOverflow).arg("min", MIN_RUBY_PT));
        }
        push_ruby_items(&mut atom.items, ruby_items);
    }
}

/// One reading's tree block: a horizontal line in the base block's font
/// and color at the fitted `size`.
fn ruby_line_block(
    block: &TextBlock,
    fallback_ids: &[String],
    size: f64,
    line: TextLine,
) -> LayoutItem {
    LayoutItem::Text(TextBlock {
        font_id: block.font_id.clone(),
        fallback_ids: fallback_ids.to_vec(),
        font_size: size,
        line_height: size,
        letter_spacing: 0.0,
        color: block.color,
        // Readings stay light for readability at small sizes.
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: block.opacity,
        baseline: None,
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: vec![line],
    })
}
