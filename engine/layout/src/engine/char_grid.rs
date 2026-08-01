//! `type: char_grid` — genkoyoshi/kanji workbooks/application-form fixed character
//! cells: the engine assigns one char per cell (school kinsoku hang-back
//! included), draws the cell grid as stroked rects, and lays ruby
//! (furigana) along each base run. Emits only existing tree primitives
//! (rects + plain text blocks), so renderers are untouched. Flow bodies
//! paginate sheet-by-sheet; bands/absolute bodies draw one sheet and
//! warn on overflow.

mod cells;
mod clamp;
mod geom;
mod glyph;
mod markup;
mod ruby;
mod sheet;
#[cfg(test)]
mod tests;

use shojiku_core::{CharGridItem, RubySegment, Style, WritingMode, MAX_CHAR_GRID_CELLS};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::flow::{FlowLayouter, MAX_PAGES};
use super::{Basis, Ctx};
use crate::style::ComputedStyle;
use cells::CellChar;
use geom::GridGeom;
use shojiku_layout_box::ResolvedBox;

/// Everything a sheet build needs, resolved once per item.
pub(super) struct GridPrep {
    pub rb: ResolvedBox,
    pub w: f64,
    pub geom: GridGeom,
    pub cells: Vec<CellChar>,
    pub segments: Vec<RubySegment>,
    pub computed: ComputedStyle,
    pub font_size: f64,
    /// Authored grid line width (`borderWidth`); `None` = the 0.5pt
    /// default. Already sanity-clamped.
    pub grid_border: Option<f64>,
    /// Chars that did not fit the assignment cap (band overflow report).
    pub overflow: usize,
    /// tate-chu-yoko digit-run length in effect (vertical grids only) — the
    /// same value cell assignment grouped by, threaded to the emitted
    /// blocks so the renderers' arrangement combines identically.
    pub combine: Option<u8>,
}

impl GridPrep {
    /// Sheets needed for the assigned cells (at least one — an empty
    /// grid still draws a blank sheet). A large-writing block reaches
    /// `scale - 1` lines below its top line, so the last sheet counts by
    /// the block's BOTTOM line.
    pub(super) fn sheets(&self) -> usize {
        let total_lines = self
            .cells
            .iter()
            .map(|c| c.line + c.scale)
            .max()
            .unwrap_or(1);
        total_lines.div_ceil(self.geom.lines)
    }
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Flow placement: one atom per sheet, paginating like any flow item.
    pub(super) fn place_char_grid(
        &mut self,
        item: &CharGridItem,
        region: &Basis,
        layouter: &mut FlowLayouter,
    ) {
        // More sheets than the page cap can never render.
        let Some(prep) = self.char_grid_prep(item, region, MAX_PAGES + 1) else {
            return;
        };
        for s in 0..prep.sheets() {
            if layouter.truncated {
                break;
            }
            let atom = self.sheet_atom(item, &prep, s);
            layouter.place(super::flex::h_auto_margin(atom, region), &mut self.diags);
        }
    }

    /// Band / absolute-body form: a single sheet; content past it warns
    /// (`char_grid_overflow`) and is dropped.
    pub(super) fn char_grid_atom(
        &mut self,
        item: &CharGridItem,
        basis: &Basis,
    ) -> Option<super::Atom> {
        let prep = self.char_grid_prep(item, basis, 1)?;
        let per_sheet = prep.geom.cpl * prep.geom.lines;
        let cut: usize = prep.overflow
            + prep
                .cells
                .iter()
                .filter(|c| c.line >= prep.geom.lines)
                .count();
        if cut > 0 {
            self.diags.push(
                Diagnostic::new(Code::CharGridOverflow)
                    .arg("cells", per_sheet)
                    .arg("dropped", cut),
            );
        }
        Some(self.sheet_atom(item, &prep, 0))
    }

    /// Resolves box, grid geometry, content, and cell assignment.
    /// `sheet_budget` bounds the assignment at `budget × sheet capacity`
    /// cells (untrusted params drive content length; the flow budget is
    /// the page cap, the band/absolute budget is one sheet). `None` = a
    /// diagnostic was emitted and the item is skipped.
    fn char_grid_prep(
        &mut self,
        item: &CharGridItem,
        basis: &Basis,
        sheet_budget: usize,
    ) -> Option<GridPrep> {
        let b = item.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let content_w = rb.content_w(w);

        let spec = &item.grid;
        let cpl = spec.chars_per_line.clamp(1, MAX_CHAR_GRID_CELLS);
        let lines = spec.lines.clamp(1, MAX_CHAR_GRID_CELLS / cpl);
        if cpl != spec.chars_per_line || lines != spec.lines {
            self.diags.push(
                Diagnostic::new(Code::CharGridClamped)
                    .arg("columns", spec.chars_per_line)
                    .arg("lines", spec.lines)
                    .arg("max", MAX_CHAR_GRID_CELLS)
                    .arg("clamped_columns", cpl)
                    .arg("clamped_lines", lines),
            );
        }

        let vertical = item.writing_mode() == WritingMode::VerticalRl;
        let char_gap = self.resolve_x(spec.char_gap, basis).unwrap_or(0.0).max(0.0);
        let line_gap = self.resolve_x(spec.line_gap, basis).unwrap_or(0.0).max(0.0);
        let cell = match self.resolve_x(spec.cell_size, basis) {
            Some(len) => len,
            None if vertical => (content_w - (lines - 1) as f64 * line_gap) / lines as f64,
            None => (content_w - (cpl - 1) as f64 * char_gap) / cpl as f64,
        };
        if !(cell.is_finite() && cell > 0.0) {
            self.diags
                .push(Diagnostic::new(Code::InvalidCellSize).arg("value", cell));
            return None;
        }

        let content =
            self.resolve_content(item.text.as_deref(), item.data.as_ref(), &item.bindings);
        let Some(content) = content else {
            self.diags.push(Diagnostic::new(Code::EmptyCharGridItem));
            return None;
        };
        let (mut segments, diags) = markup::segments(content, item.markup());
        for diag in diags {
            self.diags.push(diag);
        }
        for clamp in clamp::clamp_markup(&mut segments, cpl, lines) {
            self.diags.push(
                Diagnostic::new(Code::CharGridMarkupClamped)
                    .arg("note", clamp.note)
                    .arg("value", clamp.value)
                    .arg("max", clamp.max),
            );
        }
        let computed = self.resolve_style(&item.style_names, &item.style);
        // tate-chu-yoko is an inherited style prop like writingMode; it only acts
        // on a vertical grid (CSS: text-combine-upright is vertical-only).
        let combine = match vertical {
            true => computed.text_combine_upright.digits(),
            false => None,
        };
        let max_cells = (cpl * lines).saturating_mul(sheet_budget);
        let (mut cells, overflow) =
            cells::assign_cells(&segments, cpl, lines, item.kinsoku(), max_cells, combine);
        // Alignment reads the ITEM's own textAlign for the same reason
        // font size does: a grid's cells are cell-relative, so an
        // inherited body alignment must not silently shift them.
        let align = authored(self, item, |s| s.text_align).unwrap_or_default();
        cells::align_cells(&mut cells, cpl, align);
        // `authored` only detects that a size was set; the *value* comes
        // from the computed cascade so `em`/`%`/`rem` resolve like
        // everywhere else. Unset keeps the cell-derived default.
        let font_size = match authored(self, item, |s| s.font_size) {
            Some(_) => self.sane_font_size(computed.font_size),
            None => cell * 0.7,
        };
        let grid_border = authored(self, item, |s| s.border_width.clone())
            .map(|bw| bw.uniform().unwrap_or_else(|| bw.sides()[0]))
            .map(|bw| self.sane_border_width(bw));
        let ruby_size = match self.resolve_x(item.ruby_size, basis) {
            Some(r) if r.is_finite() && r > 0.0 => r,
            _ => cell * 0.4,
        };

        Some(GridPrep {
            rb,
            w,
            geom: GridGeom {
                cell,
                char_gap,
                line_gap,
                cpl,
                lines,
                vertical,
                ruby_size,
            },
            cells,
            segments,
            computed,
            font_size,
            grid_border,
            overflow,
            combine,
        })
    }
}

/// The item-authored value of one style key (named styles in listed
/// order, inline last), ignoring inherited/engine defaults — cell-scaled
/// defaults (font size, grid border) apply only when the author said
/// nothing.
pub(super) fn authored<T>(
    ctx: &Ctx<'_, '_>,
    item: &CharGridItem,
    pick: impl Fn(&Style) -> Option<T>,
) -> Option<T> {
    let mut found = None;
    for name in &item.style_names {
        if let Some(style) = ctx.input.template.styles.get(name) {
            found = pick(style).or(found);
        }
    }
    pick(&item.style).or(found)
}
