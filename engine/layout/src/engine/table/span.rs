//! Table spanning: the `headerGroups` group row (cells spanning
//! several columns above the labels) and the `mergeEmptyCells` body
//! transform (empty-cell runs absorbed into their right neighbor).

use shojiku_core::TableItem;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::{Atom, Ctx};
use super::rows::{Cell, CellContent, CellPath};
use super::{TableFrame, TABLE_HEADER_FILL};

impl<'a, 'b> Ctx<'a, 'b> {
    /// The header-group row, when `headerGroups` is authored: each group
    /// spans `span` columns (clamped so the cumulative span fits the
    /// column count, `header_group_span_clamped`); columns left
    /// uncovered become one trailing unlabeled cell. The row band takes
    /// the classic header fill unless overridden, and a group that
    /// authors its own `backgroundColor`/border paints it over that band
    /// (per-group fills are why the band alone cannot carry them).
    /// Placed above the label row and repeated with it. Each group cell is
    /// addressed by its own authored position (`headerGroups[n]`) in both
    /// the box index and its diagnostics — never as the leftmost column it
    /// spans, which the GUI would open the wrong editor for.
    pub(super) fn header_group_atom(
        &mut self,
        table: &TableItem,
        frame: &TableFrame,
    ) -> Option<Atom> {
        if table.header_groups.is_empty() {
            return None;
        }
        let hidden = table.header.as_ref().is_some_and(|h| h.visually_hidden());
        let mut cells = Vec::new();
        let mut col = 0;
        for (index, group) in table.header_groups.iter().enumerate() {
            if col >= frame.widths.len() {
                self.diags
                    .push(Diagnostic::new(Code::HeaderGroupSpanClamped));
                break;
            }
            let span = group.span.max(1);
            // Saturating: `span` is attacker-sized (any u64 parses), and a
            // wrapped `col + span` would put `end` BEFORE `col` — skipping
            // the clamp diagnostic and panicking the slice below.
            let end = col.saturating_add(span).min(frame.widths.len());
            if end - col != span {
                self.diags
                    .push(Diagnostic::new(Code::HeaderGroupSpanClamped));
            }
            // A group's fill/border are its OWN (each entry carries its own
            // style, so the one row band cannot express them) and they are
            // non-inherited, so `resolve_style` leaves them set only when
            // this group authored them — unlike the header LABEL row, whose
            // style IS the band's and would double-paint per cell.
            let mut computed = self.resolve_style(&group.style_names, &group.style);
            computed.vertical_align = self.cell_valign(&group.style_names, &group.style);
            if hidden {
                // A group carries its OWN fill/border, which the row band
                // cannot switch off for it — so the cell itself goes fully
                // transparent, taking its text with it.
                computed.opacity = 0.0;
                computed.background_color = None;
                computed.border_widths = [0.0; 4];
            }
            let label = self.header_label(group.label.as_deref());
            cells.push(Cell {
                width: frame.widths[col..end].iter().sum(),
                content: CellContent::Text(label),
                computed,
                id: None,
                path: CellPath::Group(index),
            });
            col = end;
        }
        if col < frame.widths.len() {
            cells.push(Cell {
                width: frame.widths[col..].iter().sum(),
                content: CellContent::Text(String::new()),
                // No `hidden` branch here: this filler has empty content and
                // an empty style, so it paints nothing either way — the row
                // band and the grid stroke are what `hidden` switches off,
                // and `row_atom` owns both.
                computed: self.resolve_style(&[], &shojiku_core::Style::default()),
                id: None,
                // No group covers this trailing region, so it is layout's own
                // filler: nothing authored to address or select.
                path: CellPath::Synthesized,
            });
        }
        let mut decor = self.resolve_style(&[], &shojiku_core::Style::default());
        if decor.background_color.is_none() {
            decor.background_color = Some(TABLE_HEADER_FILL.to_string());
        }
        // The spanning row is header chrome: it repeats WITH the header and
        // draws above the labels, so hiding the header must hide it too —
        // leaving it painted would show a lone grey band over nothing.
        Some(self.row_atom(frame, frame.geom.header_fixed, &cells, &decor, hidden))
    }
}

/// The `mergeEmptyCells` transform: a run of empty-content cells merges
/// into the next non-empty cell to its right (which grows leftward);
/// trailing empties extend the last non-empty cell rightward; an
/// all-empty row collapses to one full-width cell. Swallowed cells lose
/// their column `id` placement (there is no cell left to place).
pub(super) fn merge_empty<'i>(cells: Vec<Cell<'i>>) -> Vec<Cell<'i>> {
    let mut merged: Vec<Cell<'i>> = Vec::with_capacity(cells.len());
    let mut pending = 0.0;
    for cell in cells {
        // Only empty TEXT cells merge; qr/image/`cell:` columns always
        // count as content (their emptiness is a per-row data question).
        if matches!(&cell.content, CellContent::Text(s) if s.is_empty()) {
            pending += cell.width;
            continue;
        }
        let mut cell = cell;
        cell.width += pending;
        pending = 0.0;
        merged.push(cell);
    }
    match merged.last_mut() {
        Some(last) => last.width += pending,
        None => {
            // Every cell was empty: keep one full-width cell so the row
            // band and grid still draw. Its content is synthesized and
            // covers every column, so there is no one column to name.
            return vec![Cell {
                width: pending,
                content: CellContent::Text(String::new()),
                computed: crate::style::ComputedStyle::default(),
                id: None,
                path: CellPath::Synthesized,
            }];
        }
    }
    merged
}
