//! The vertical ruby applier: readings as small upright vertical
//! columns just right of their base run (JLREQ), shrunk to the run's
//! shaped extent with the print floor, split proportionally when the
//! base wraps across columns. Handles plain AND rich (`spans`) blocks —
//! the cell builder rebuilds per-run arrangements for rich columns.

use std::collections::HashMap;

use shojiku_core::{TextItem, TextOrientation};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::super::{Atom, Basis, Ctx};
use super::{fit, match_entries, push_ruby_items, slice_extent, Cell, MIN_RUBY_PT};
use crate::font::RunOptions;
use crate::style::ComputedStyle;
use crate::tree::{LayoutItem, TextBlock, TextLine};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Attaches the item's ruby readings to a finished vertical block
    /// atom (plain or rich). The block is final (post
    /// shrink/ellipsis/clip), so bases are matched against exactly what
    /// will be drawn. Records each reading's owning column in
    /// `ruby_anchors` (the flow paginator's re-anchoring channel).
    pub(in crate::engine::text) fn apply_vertical_ruby(
        &mut self,
        atom: &mut Atom,
        text: &TextItem,
        computed: &ComputedStyle,
        basis: &Basis,
    ) {
        // Every vertical atom carries a text block; the walk reaches
        // through a `textOverflow: clip` wrapper.
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
                .or_insert_with(|| self.vertical_cells(&block, line));
            let Some(se) = slice_extent(line_cells, &m.range) else { continue };
            // Shrink the reading to its base run (advances are linear in
            // size), floored for readability.
            let measure = |s: f64| {
                crate::font::vertical_extent(
                    &resolved.faces,
                    &m.reading,
                    s,
                    TextOrientation::Upright,
                    RunOptions::spacing_only(0.0),
                )
            };
            let mut size = preferred;
            let mut read_ext = measure(size);
            if read_ext > se.extent && read_ext > 0.0 {
                size = fit(size, size * se.extent / read_ext);
                read_ext = measure(size);
            }
            overflowed |= read_ext > se.extent + 0.01;
            self.ruby_anchors.push(m.line);
            ruby_items.push(ruby_block(
                &block,
                &resolved.fallback_ids,
                size,
                TextLine {
                    text: m.reading,
                    // Flush against the right edge of the base run's em
                    // cell (JLREQ: ruby sits right of its base).
                    x: line.x + block.line_height / 2.0 + se.size / 2.0,
                    y: line.y + se.at + (se.extent - read_ext) / 2.0,
                    width: read_ext,
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

/// One reading's tree block: an upright vertical column in the base
/// block's font and color at the fitted `size`.
fn ruby_block(block: &TextBlock, fallback_ids: &[String], size: f64, line: TextLine) -> LayoutItem {
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
        // Kana readings stay upright regardless of the block orientation.
        vertical: Some(TextOrientation::Upright),
        text_combine: None,
        lines: vec![line],
    })
}
