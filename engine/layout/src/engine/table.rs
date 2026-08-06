//! Tables: row-by-row pagination, repeating headers, keep-together, and
//! the id-addressable table fragments. This file is the module root:
//! `place_table` plus the shared per-table geometry/border types; cell
//! and row building live in `rows`, style resolution in `style`, width/
//! height resolution in `geom`.

mod atom;
mod content;
mod geom;
mod rows;
mod span;
mod style;

use serde_json::Value;
use shojiku_core::{resolve_path, AlignItems, Bindings, EmptyBehavior, TableItem};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::cross_offset;

use super::decoration;
use super::flow::FlowLayouter;
use super::fragments::Fragments;
use super::{Atom, Basis, Ctx};

/// The default header fill when no header style sets a `backgroundColor`.
const TABLE_HEADER_FILL: &str = "#ededed";

/// The grid default when no table style sets a `borderWidth`.
const TABLE_BORDER_WIDTH: f64 = 0.5;

/// The resolved grid stroke (row outlines + column separators) plus the
/// optional per-side outer frame (map form), drawn per page
/// fragment.
struct GridBorder {
    width: f64,
    color: (f32, f32, f32),
    outer: Option<decoration::SideBorders>,
}

/// Resolved per-table vertical geometry (all pt, guarded).
#[derive(Clone, Copy)]
struct RowGeom {
    /// `row.height`: fixes every body row (activates `textOverflow`).
    fixed: Option<f64>,
    /// `row.minHeight` floor for auto-height rows.
    min: f64,
    /// `header.height`: fixes the header row.
    header_fixed: Option<f64>,
    /// `cellPadding`, clamped non-negative.
    padding: f64,
}

/// The per-table invariants every row shares: resolved column widths,
/// vertical geometry, grid stroke, and the region-left x.
struct TableFrame<'w> {
    widths: &'w [f64],
    geom: RowGeom,
    grid: GridBorder,
    x: f64,
}

impl<'a, 'b> Ctx<'a, 'b> {
    pub(super) fn place_table(
        &mut self,
        table: &TableItem,
        region: &Basis,
        layouter: &mut FlowLayouter,
    ) {
        // `box` narrows the table horizontally within the flow region
        // (`box.y`/height stay flow-owned); no `box` keeps the full region.
        let region = &self.table_flow_region(table, region);
        let key = &table.data.key;
        let Some(rows) = self.table_rows(table) else {
            return;
        };

        let widths = self.column_widths(&table.columns, region);
        let total_w: f64 = widths.iter().sum();
        if total_w > region.w + 0.01 {
            self.diags.push(
                Diagnostic::new(Code::TableTooWide)
                    .arg("total", total_w)
                    .arg("avail", region.w),
            );
        }
        let frame = TableFrame {
            widths: &widths,
            geom: self.row_geom(table, region),
            grid: self.grid_border(table),
            x: region.x,
        };

        // The table's own style cascades into header and cells (CSS: a
        // table is a styling container); restored after the atoms are
        // built so siblings are unaffected.
        let saved_style = self.inherited.clone();
        self.inherited = self.resolve_style(&table.style_names, &table.style);
        let group_atom = self.header_group_atom(table, &frame);
        let header_atom = self.table_header_atom(table, &frame);
        let row_atoms: Vec<Atom> = rows
            .iter()
            .enumerate()
            .map(|(i, row)| self.table_row_atom(table, &frame, row, i))
            .collect();
        self.inherited = saved_style;

        // keepTogether: when the whole table would split but fits on one
        // fresh page, break first. Taller-than-a-page tables paginate as
        // usual — a break could not keep them together anyway.
        if table.keep_together() && !layouter.fresh_page {
            let total_h = group_atom.as_ref().map_or(0.0, |a| a.height)
                + header_atom.as_ref().map_or(0.0, |a| a.height)
                + row_atoms.iter().map(|a| a.height).sum::<f64>();
            if !layouter.fits(total_h) && total_h <= layouter.region_bottom - layouter.region_top {
                layouter.break_page(&mut self.diags);
            }
        }

        let mut frags = Fragments::default();
        for head in [&group_atom, &header_atom].into_iter().flatten() {
            layouter.place(head.clone(), &mut self.diags);
            frags.track(layouter, head.height);
        }
        for atom in row_atoms {
            if !layouter.fits(atom.height) && !layouter.fresh_page {
                if !table.auto_page_break() {
                    self.diags
                        .push(Diagnostic::new(Code::RowOverflow).arg("key", key));
                    break;
                }
                if !layouter.break_page(&mut self.diags) {
                    break;
                }
                if table.repeat_header() {
                    for head in [&group_atom, &header_atom].into_iter().flatten() {
                        layouter.place(head.clone(), &mut self.diags);
                        frags.track(layouter, head.height);
                    }
                }
            }
            let height = atom.height;
            layouter.place(atom, &mut self.diags);
            frags.track(layouter, height);
        }
        if let Some(outer) = &frame.grid.outer {
            frags.draw_frame(outer, region.x, total_w, layouter);
        }
        frags.emit(
            &self.current_path(),
            table.id.as_deref(),
            region.x,
            total_w,
            layouter,
        );
    }

    /// Fetches the table's row array under the empty-behavior gate,
    /// shared by the flow (`place_table`) and bounded (`table_atom`)
    /// paths. `None` = render nothing (data missing/degraded already
    /// warned, or an empty array under `collapse`/`hide`). `Some(rows)`
    /// may still be empty (`reserve`/`show` → header + frame only).
    pub(super) fn table_rows(&mut self, table: &TableItem) -> Option<Vec<Value>> {
        let key = &table.data.key;
        let rows = match resolve_path(self.input.params, key) {
            None => {
                self.diags.push(
                    Diagnostic::new(Code::MissingData)
                        .arg("scope", "table data ")
                        .arg("key", key.as_str()),
                );
                Vec::new()
            }
            Some(Value::Array(rows)) => rows.clone(),
            Some(_) => {
                self.diags
                    .push(Diagnostic::new(Code::NotAnArray).arg("key", key.as_str()));
                return None;
            }
        };
        if rows.is_empty() && matches!(table.empty_behavior(), EmptyBehavior::Collapse) {
            return None;
        }
        Some(rows)
    }

    /// A header label as drawn: interpolated like any other static text,
    /// so `label: "{labels.amount}"` reads params instead of pinning one
    /// language into the template. Shared by the column labels
    /// (`rows/prepare.rs`) and the `headerGroups` ones (`span.rs`) — the
    /// two surfaces that used the authored string verbatim while every
    /// other text-bearing item already resolved bindings.
    ///
    /// Header chrome is document-level, so segments read TOP-LEVEL params
    /// (a header is not scoped to any row) and the label declares no
    /// bindings of its own. A label with no `{…}` in it resolves to
    /// itself, which is why every existing template renders unchanged.
    /// An absent label is passed straight through: `resolve_content`
    /// answers `None` when nothing is authored (silently — the caller
    /// owns any diagnostic), so the unlabeled column needs no branch here.
    pub(super) fn header_label(&mut self, label: Option<&str>) -> String {
        self.resolve_content(label, None, &Bindings::new())
            .unwrap_or_default()
    }

    /// The horizontal region a flow table occupies: `box.x`/`box.w`
    /// narrow it within the flow region, `auto` left/right margins center
    /// it (mirroring `h_auto_margin`); `box.y` and height stay flow-owned.
    /// No `box` returns the full region unchanged (byte-identical output
    /// for every table without a box).
    fn table_flow_region(&mut self, table: &TableItem, region: &Basis) -> Basis {
        let Some(b) = &table.box_ else {
            return *region;
        };
        let rb = self.resolve_box(b, region);
        let w = rb.w_or_fill(region, 1.0);
        let dx = if rb.margin_auto[3] || rb.margin_auto[1] {
            let free = region.w - ((rb.x - region.x) + w + rb.margin[1]);
            cross_offset(
                free,
                AlignItems::Start,
                rb.margin_auto[3],
                rb.margin_auto[1],
            )
        } else {
            0.0
        };
        Basis {
            x: rb.content_x() + dx,
            w: rb.content_w(w),
            h: region.h,
            font: region.font,
            pct_w: None,
            fill_h: None,
        }
    }
}
