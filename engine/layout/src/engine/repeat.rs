//! Imposition / n-up (`type: repeat`): tiles data-scoped cells into a
//! rigid columns x rows grid that fills the flow region and paginates.

mod cell;
mod marks;
mod pages;

use serde_json::Value;
use shojiku_core::{resolve_path, BreakBefore, RepeatItem, MAX_IMPOSITION_PER_PAGE};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use std::rc::Rc;

use self::marks::Sheet;
use self::pages::GridPages;
use super::flow::FlowLayouter;
use super::fragments::Fragments;
use super::{Basis, Ctx};

/// One imposition grid cell's absolute rectangle on the page (top-left
/// origin, pt). A `repeat` cell's children resolve against it. Built and
/// consumed once per cell (moved into `layout_cell`), so it needs neither
/// `Copy` nor `Clone`.
struct Slot {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Resolves a data-driven item's bound array (shared by `repeat` and
    /// `repeat_flow`): a missing key warns (`missing_data`), a non-array
    /// value errors (`not_an_array`); both return `None` so the item is
    /// skipped without failing the layout.
    pub(super) fn array_elements(&mut self, key: &str, kind: &str) -> Option<Vec<Value>> {
        match resolve_path(self.input.params, key) {
            None => {
                self.diags.push(
                    Diagnostic::new(Code::MissingData)
                        .arg("scope", format!("{kind} data "))
                        .arg("key", key),
                );
                None
            }
            Some(Value::Array(rows)) => Some(rows.clone()),
            Some(_) => {
                self.diags
                    .push(Diagnostic::new(Code::NotAnArray).arg("key", key));
                None
            }
        }
    }

    /// Places a `repeat` (imposition / n-up): one data-scoped `cell` per array
    /// element, tiled into a `columns × rows` grid that fills the flow region
    /// and paginates when a page's grid is full. Flow-only (bands and the
    /// absolute body warn+skip, like `table`). The grid is clamped to
    /// [`MAX_IMPOSITION_PER_PAGE`] cells per page so a hostile template cannot
    /// drive degenerate slots or a zero divisor — a diagnostic, never a panic.
    pub(super) fn place_repeat(
        &mut self,
        repeat: &RepeatItem,
        region: &Basis,
        layouter: &mut FlowLayouter,
    ) {
        let key = &repeat.data.key;
        let Some(elements) = self.array_elements(key, "repeat") else {
            return;
        };
        if elements.is_empty() {
            return;
        }

        // Clamp the grid so `columns × rows` never exceeds the per-page cap
        // and each axis is at least 1 (so the slot math never divides by
        // zero). Clamping `columns` first bounds `rows` to `cap / columns`,
        // keeping the product ≤ cap with no risk of `usize` overflow.
        let grid = &repeat.grid;
        let cols = grid.columns().clamp(1, MAX_IMPOSITION_PER_PAGE);
        let rows = grid.rows().clamp(1, MAX_IMPOSITION_PER_PAGE / cols);
        if cols != grid.columns() || rows != grid.rows() {
            self.diags.push(
                Diagnostic::new(Code::ImpositionGridClamped)
                    .arg("columns", grid.columns())
                    .arg("rows", grid.rows())
                    .arg("max", MAX_IMPOSITION_PER_PAGE)
                    .arg("clamped_columns", cols)
                    .arg("clamped_rows", rows),
            );
        }

        // Slot geometry: the region minus the inter-cell gaps, divided evenly.
        // Always derived from the FULL region, so a `breakBefore: auto` grid
        // starting under the cursor shortens its first page's row COUNT and
        // keeps its cells the size every other page draws them (the sheet
        // gets physically cut).
        let region_bottom = layouter.region_bottom;
        let region_h = region_bottom - layouter.region_top;
        // Negative gaps would overlap the cells (and walk a slot origin
        // backwards); CSS gaps are non-negative, and the box grid and
        // `repeat_flow` already clamp theirs the same way.
        let col_gap = self
            .resolve_x(grid.column_gap(), region)
            .unwrap_or(0.0)
            .max(0.0);
        let row_gap = self
            .resolve_y(grid.row_gap(), region)
            .unwrap_or(0.0)
            .max(0.0);
        let slot_w = ((region.w - col_gap * (cols - 1) as f64) / cols as f64).max(0.0);
        let slot_h = ((region_h - row_gap * (rows - 1) as f64) / rows as f64).max(0.0);

        let Some(plan) = self.plan_pages(repeat, layouter, (cols, rows), (slot_h, row_gap)) else {
            return;
        };
        let base = layouter.pages.len() - 1;
        // The `repeat` item accepts an `id:` but places no atom of its own —
        // only cells land. Track each page's occupied extent (the grid's top
        // on that page → the deepest slot on it) so the item itself gets a
        // box-index fragment the Designer can address.
        let mut frags = Fragments::default();
        let mut last_page = 0;
        'elements: for (i, element) in elements.into_iter().enumerate() {
            let at = plan.locate(i);
            let target = base + at.page;
            while layouter.pages.len() <= target {
                if !layouter.break_page(&mut self.diags) {
                    // Page cap hit (`page_overflow` already emitted); stop
                    // adding cells but still emit fragments for the pages
                    // that DID fill.
                    break 'elements;
                }
            }
            let slot = Slot {
                x: region.x + at.col as f64 * (slot_w + col_gap),
                y: at.top + at.row as f64 * (slot_h + row_gap),
                w: slot_w,
                h: slot_h,
            };
            let slot_y = slot.y;
            let (cell_items, cell_boxes) =
                self.layout_cell(&repeat.cell, slot, Rc::new(element), (key, i));
            if let Some(page) = layouter.pages.get_mut(target) {
                page.items.extend(cell_items);
                page.boxes.extend(cell_boxes);
                frags.cover(target, slot_y, slot_y + slot_h);
                last_page = at.page;
            }
        }
        if repeat.cut_marks() {
            let sheet = Sheet {
                region_x: region.x,
                slot: (slot_w, slot_h),
                gap: (col_gap, row_gap),
                cols,
            };
            self.place_cut_marks(&plan, &sheet, (base, last_page), layouter);
        }
        // A `repeat` consumes the region; following flow siblings start fresh.
        layouter.cursor = region_bottom;
        layouter.fresh_page = false;
        frags.emit(
            &self.current_path(),
            repeat.id.as_deref(),
            region.x,
            region.w,
            layouter,
        );
    }

    /// Decides where the grid's first page starts. `breakBefore: auto` keeps
    /// the flow cursor when at least one full-height row still fits under it;
    /// every other case (the default, a fresh page, or a cursor too low to
    /// fit a single row) aligns the grid to the region top of a fresh page.
    /// `None` means the page cap was hit while breaking — nothing to place.
    fn plan_pages(
        &mut self,
        repeat: &RepeatItem,
        layouter: &mut FlowLayouter,
        (cols, rows): (usize, usize),
        (slot_h, row_gap): (f64, f64),
    ) -> Option<GridPages> {
        let mut plan = GridPages {
            cols,
            rows,
            first_rows: rows,
            first_top: layouter.region_top,
            region_top: layouter.region_top,
            direction: repeat.grid.direction(),
        };
        if repeat.break_before() == BreakBefore::Auto && !layouter.fresh_page {
            let avail = layouter.region_bottom - layouter.cursor;
            let first_rows = pages::first_page_rows(avail, slot_h, row_gap, rows);
            if first_rows > 0 {
                plan.first_rows = first_rows;
                plan.first_top = layouter.cursor;
                return Some(plan);
            }
            // Not even one row fits under the cursor: fall through and break,
            // rather than place a zero-row grid (which would never advance).
        }
        // The grid aligns to the region top on every page it uses; if the
        // current page already has content, break to a fresh one first.
        if !layouter.fresh_page && !layouter.break_page(&mut self.diags) {
            return None;
        }
        Some(plan)
    }
}
