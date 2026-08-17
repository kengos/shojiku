//! Static grid child placement (box-model Phase 3, `box.type: grid`):
//! children without authored `box.x`/`box.y` tile the column tracks in
//! fill order (`direction`), rows are explicit tracks or sized by their
//! tallest child, and `justifyContent` distributes leftover track
//! space. Children with either coordinate keep the Phase-1 absolute
//! placement, exactly like flex. Track math lives in
//! `shojiku-layout-box`; the `TrackSpec` resolution (with the hostile
//! track-count caps) is in the `tracks` submodule.

mod cells;
mod span;
mod tracks;

use span::CellSpan;

use shojiku_core::{FlexDirection, Item, OptBox};
use shojiku_layout_box::{cross_offset, main_spacing, track_offsets};

use crate::boxes::PlacedBox;
use crate::tree::LayoutItem;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::flex::{emit_slots, h_auto_margin, FlexKind, Slot};
use super::visibility::{self, Visibility};
use super::{Atom, Basis, Ctx};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Lays out a grid box's children against `inner` (the resolved
    /// parent content box); same contract as the flex walk
    /// (`layout_box_children`), which dispatches here for
    /// `box.type: grid`.
    pub(super) fn layout_grid_children(
        &mut self,
        items: &[Item],
        visibility: &[Visibility],
        inner: &Basis,
        b: &OptBox,
        depth: usize,
        clipped: bool,
    ) -> (Vec<LayoutItem>, Vec<PlacedBox>, f64) {
        let align = b.align_items.unwrap_or_default();
        // Grid fill order defaults to row-major (CSS `grid-auto-flow:
        // row`) — unlike flex, whose default main axis is `column`.
        let direction = b.direction.unwrap_or(FlexDirection::Row);
        // The flex `gap` doubles as the CSS shorthand: the axis-specific
        // key wins.
        let col_gap = self
            .resolve_x(b.column_gap.or(b.gap), inner)
            .unwrap_or(0.0)
            .max(0.0);
        let row_gap = self
            .resolve_y(b.row_gap.or(b.gap), inner)
            .unwrap_or(0.0)
            .max(0.0);

        // Order matters and is the reverse of the obvious one: an `auto`
        // column is as wide as the cells placed in it, so the cells must
        // be assigned before the tracks can be sized. The column COUNT is
        // knowable from the spec without any size, which is what breaks
        // the circle.
        let cols = cells::spec_columns(b.columns.as_ref());
        let n_grid = items
            .iter()
            .zip(visibility)
            .filter(|(i, v)| !v.is_collapsed() && FlexKind::of(i).is_some())
            .count();
        // Row spans can reach past the count-derived bound; an explicit
        // track list keeps every authored row regardless of child count.
        let explicit_len = match b.rows.as_ref() {
            Some(shojiku_core::TrackSpec::Tracks(tracks)) => tracks.len(),
            _ => 0,
        };
        let rows_count = n_grid.div_ceil(cols).max(1).max(explicit_len);
        let cell_plan = self.plan_cells(items, visibility, cols, direction, rows_count);
        let auto_widths =
            self.auto_column_widths(&cell_plan, b.columns.as_ref(), inner, cols, depth);
        let col_ws = self.column_tracks(b.columns.as_ref(), inner.w, col_gap, &auto_widths);
        let (mut explicit_rows, fr_rows) =
            self.row_tracks(b.rows.as_ref(), inner, row_gap, rows_count);

        // Column x offsets: leftover width distributes per
        // `justifyContent` (equal-count tracks consume it all, so this
        // only acts on explicit track lists).
        let used: f64 = col_ws.iter().sum::<f64>() + col_gap * (cols - 1) as f64;
        let justify = b.justify_content.unwrap_or_default();
        let (lead, between) = main_spacing(inner.w - used, cols, justify);
        let col_xs = track_offsets(&col_ws, col_gap + between, inner.x + lead);

        // `fr` rows split what is LEFT, and until now "left" meant only
        // the fixed rows: an auto row's height is its tallest child's, and
        // nothing had been placed. So measure the auto rows now — parked,
        // so the throwaway placement says nothing to the author — and run
        // the split again with them subtracted too.
        if let Some(auto_sum) = self.measure_auto_rows(
            &cell_plan,
            &explicit_rows,
            &fr_rows,
            &col_ws,
            &col_xs,
            col_gap,
            inner,
            depth,
        ) {
            self.distribute_fr_rows(
                &mut explicit_rows,
                &fr_rows.frs,
                inner.h,
                fr_rows.fixed_sum + auto_sum,
                row_gap,
                rows_count,
            );
        }

        // Pass 1: lay out every child in document order. Grid items take
        // The next free cell run from the occupancy map (spans:
        // `columnSpan`/`rowSpan` consume several tracks, clamped to the
        // axis with a diagnostic).
        let mut slots = Vec::new();
        let mut cells: Vec<CellSpan> = Vec::new();
        let mut plan_idx = 0;
        for (i, child) in items.iter().enumerate() {
            if visibility[i].is_collapsed() {
                continue;
            }
            let hidden = visibility[i] == Visibility::Hidden;
            let mark = self.enter_item(format!("items[{i}]"));
            match FlexKind::of(child) {
                Some(kind) => {
                    // `cell_plan` was built with the same `FlexKind::of`
                    // filter over the same items, so `plan_idx` is always
                    // in range — the flex walk indexes its row bases the
                    // same way.
                    let cell = cell_plan[plan_idx].2;
                    plan_idx += 1;
                    while explicit_rows.len() < cell.row + cell.rows {
                        explicit_rows.push(None);
                    }
                    let w = col_ws[cell.col..cell.col + cell.cols].iter().sum::<f64>()
                        + col_gap * (cell.cols - 1) as f64;
                    let spanned = &explicit_rows[cell.row..cell.row + cell.rows];
                    let h = spanned
                        .iter()
                        .copied()
                        .sum::<Option<f64>>()
                        .map(|sum| sum + row_gap * (cell.rows - 1) as f64);
                    let basis = Basis {
                        x: col_xs[cell.col],
                        w,
                        h,
                        font: inner.font,
                        pct_w: None,
                        fill_h: None,
                    };
                    if let Some(atom) = self.flex_child_atom(kind, &basis, depth) {
                        // The column-axis counterpart of the row-track
                        // check below: a child wider than the track run it
                        // was placed in spills over its neighbour.
                        self.check_track_width(&atom, &basis, cell.cols);
                        // Horizontal auto margins act within the cell run.
                        slots.push(Slot::Flex(visibility::blank_if(
                            h_auto_margin(atom, &basis),
                            hidden,
                        )));
                        cells.push(cell);
                    }
                }
                None => {
                    if let Some((atom, dy)) = self.absolute_child_atom(child, inner, depth) {
                        self.check_child_right(&atom, inner, clipped);
                        slots.push(Slot::Abs(visibility::blank_if(atom, hidden), dy));
                    }
                }
            }
            self.leave_item(mark);
        }

        // Row heights: explicit tracks keep their size (a taller child
        // warns and overflows, CSS-like); auto rows take their tallest
        // single-row child first, then row-spanning children pour any
        // leftover height into their LAST spanned row (the v1 span
        // distribution — simple and order-stable).
        let grid_atoms: Vec<&Atom> = slots
            .iter()
            .filter_map(|slot| match slot {
                Slot::Flex(atom) => Some(atom),
                Slot::Abs(..) => None,
            })
            .collect();
        let row_hs = self.row_heights(&grid_atoms, &cells, &explicit_rows, row_gap);

        // Pass 2: vertical offsets — row start plus the within-span
        // alignment (auto vertical margins beat `alignItems`, as in
        // flex).
        let row_ys = track_offsets(&row_hs, row_gap, 0.0);
        let offs: Vec<(f64, f64)> = grid_atoms
            .iter()
            .zip(&cells)
            .map(|(atom, cell)| {
                let span_h: f64 = row_hs[cell.row..cell.row + cell.rows].iter().sum::<f64>()
                    + row_gap * (cell.rows - 1) as f64;
                let (auto_top, auto_bottom) = atom
                    .rb
                    .map_or((false, false), |rb| (rb.margin_auto[0], rb.margin_auto[2]));
                let dy = row_ys[cell.row]
                    + cross_offset(span_h - atom.height, align, auto_top, auto_bottom);
                (dy, 0.0)
            })
            .collect();

        emit_slots(&slots, &offs)
    }

    /// Effective spans clamped to the grid: columns to the track count,
    /// rows to [`shojiku_core::MAX_GRID_TRACKS`] (rows grow on demand,
    /// so the cap only bounds hostile values). Clamping warns once per
    /// child (`grid_span_clamped`).
    fn clamped_spans(&mut self, b: &OptBox, cols: usize) -> (usize, usize) {
        let (cs, rs) = b.spans();
        let cs_eff = cs.min(cols);
        let rs_eff = rs.min(shojiku_core::MAX_GRID_TRACKS);
        if cs_eff != cs || rs_eff != rs {
            self.diags.push(
                Diagnostic::new(Code::GridSpanClamped)
                    .arg("columns", cs)
                    .arg("rows", rs)
                    .arg("clamped_columns", cs_eff)
                    .arg("clamped_rows", rs_eff),
            );
        }
        (cs_eff, rs_eff)
    }

    /// The final height of every row: an explicit track keeps its size
    /// (a taller child warns and overflows, CSS-like), an auto row takes
    /// its tallest single-row child, and only then do row-spanning
    /// children pour whatever they still overflow into their LAST spanned
    /// row (the v1 span distribution — simple and order-stable).
    ///
    /// The order of the two walks is load-bearing: a span's leftover is
    /// measured against rows that already know their own children.
    fn row_heights(
        &mut self,
        grid_atoms: &[&Atom],
        cells: &[CellSpan],
        explicit_rows: &[Option<f64>],
        row_gap: f64,
    ) -> Vec<f64> {
        let mut row_hs: Vec<f64> = explicit_rows.iter().map(|h| h.unwrap_or(0.0)).collect();
        for (atom, cell) in grid_atoms.iter().zip(cells) {
            if cell.rows > 1 {
                continue;
            }
            match explicit_rows[cell.row] {
                Some(h) => {
                    if atom.height > h + 0.01 {
                        self.diags.push(
                            Diagnostic::new(Code::GridCellOverflow)
                                .arg("child", atom.height)
                                .arg("track", h)
                                .arg("extent", "row track"),
                        );
                    }
                }
                None => row_hs[cell.row] = row_hs[cell.row].max(atom.height),
            }
        }
        for (atom, cell) in grid_atoms.iter().zip(cells) {
            if cell.rows == 1 {
                continue;
            }
            let last = cell.row + cell.rows - 1;
            let spanned: f64 =
                row_hs[cell.row..=last].iter().sum::<f64>() + row_gap * (cell.rows - 1) as f64;
            match explicit_rows[last] {
                Some(_) => {
                    if atom.height > spanned + 0.01 {
                        self.diags.push(
                            Diagnostic::new(Code::GridCellOverflow)
                                .arg("child", atom.height)
                                .arg("track", spanned)
                                .arg("extent", "spanned rows"),
                        );
                    }
                }
                None => {
                    if atom.height > spanned {
                        row_hs[last] += atom.height - spanned;
                    }
                }
            }
        }

        row_hs
    }
}
