//! Table geometry resolution: `Length` column widths (with the unsized
//! equal-share fallback) and the guarded row/header heights + cell
//! padding, all resolved against the flow region.

use shojiku_core::{Column, Length, TableItem};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::equal_share;

use super::super::{Basis, Ctx};
use super::RowGeom;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Resolves every column to absolute pt against the region width.
    /// Sized columns go through the guarded resolver (`%` of the region,
    /// physical units, the `MAX_RESOLVED_PT` cap); columns without a
    /// `width` split the leftover equally (clamped at 0 when the sized
    /// columns already overfill — `table_too_wide` reports that).
    pub(super) fn column_widths(&mut self, columns: &[Column], region: &Basis) -> Vec<f64> {
        let sized: Vec<Option<f64>> = columns
            .iter()
            .enumerate()
            .map(|(col, c)| {
                c.width.map(|len| {
                    // A width problem belongs to the column that authored
                    // it, like every other per-column diagnostic.
                    let mark = self.enter_item(format!("columns[{col}]"));
                    let w = self.column_width(len, region);
                    self.leave_item(mark);
                    w
                })
            })
            .collect();
        let used: f64 = sized.iter().flatten().sum();
        let auto_count = sized.iter().filter(|w| w.is_none()).count();
        let share = equal_share(region.w - used, auto_count);
        sized.into_iter().map(|w| w.unwrap_or(share)).collect()
    }

    /// One sized column: guarded resolve, negative clamps to 0 with a
    /// diagnostic (a negative width would walk the cell cursor backwards).
    fn column_width(&mut self, len: Length, region: &Basis) -> f64 {
        let w = self.resolve_x(Some(len), region).unwrap_or(0.0);
        if w < 0.0 {
            self.diags
                .push(Diagnostic::new(Code::InvalidColumnWidth).arg("value", w));
            return 0.0;
        }
        w
    }

    /// Resolves the vertical knobs: fixed row height (activates the cell
    /// `textOverflow` policies), the auto-row `minHeight` floor, the
    /// fixed header height, and the cell padding. `%` heights resolve
    /// against the region height; negative fixed heights fall back to
    /// auto with a diagnostic, negative padding to 0.
    pub(super) fn row_geom(&mut self, table: &TableItem, region: &Basis) -> RowGeom {
        let min = self
            .resolve_y(Some(table.row.min_height()), region)
            .unwrap_or(0.0)
            .max(0.0);
        let fixed = table
            .row
            .height
            .and_then(|len| self.fixed_height(len, region, "row"));
        let header_fixed = table
            .header
            .as_ref()
            .and_then(|h| h.height)
            .and_then(|len| self.fixed_height(len, region, "header"));
        let mut padding = table.cell_padding();
        if padding < 0.0 {
            self.diags
                .push(Diagnostic::new(Code::InvalidCellPadding).arg("value", padding));
            padding = 0.0;
        }
        RowGeom {
            fixed,
            min,
            header_fixed,
            padding,
        }
    }

    /// One fixed height: guarded resolve, negative means "auto" with a
    /// diagnostic.
    fn fixed_height(&mut self, len: Length, region: &Basis, what: &str) -> Option<f64> {
        let h = self.resolve_y(Some(len), region)?;
        if h < 0.0 {
            self.diags.push(
                Diagnostic::new(Code::InvalidRowHeight)
                    .arg("what", what)
                    .arg("value", h),
            );
            return None;
        }
        Some(h)
    }
}
