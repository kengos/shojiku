//! Static grid child placement (box-model Phase 3, `box.type: grid`):
//! children without authored `box.x`/`box.y` tile the column tracks in
//! fill order (`direction`), rows are explicit tracks or sized by their
//! tallest child, and `justifyContent` distributes leftover track
//! space. Children with either coordinate keep the Phase-1 absolute
//! placement, exactly like flex. Track math lives in
//! `shojiku-layout-box`; the `TrackSpec` resolution (with the hostile
//! track-count caps) is in the `tracks` submodule.

mod span;
mod tracks;

use span::{CellSpan, Occupancy};

use shojiku_core::{FlexDirection, Item, OptBox};
use shojiku_layout_box::{cross_offset, main_spacing, track_offsets};

use crate::boxes::PlacedBox;
use crate::tree::LayoutItem;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::flex::{emit_slots, h_auto_margin, FlexKind, Slot};
use super::{Atom, Basis, Ctx};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Lays out a grid box's children against `inner` (the resolved
    /// parent content box); same contract as the flex walk
    /// (`layout_box_children`), which dispatches here for
    /// `box.type: grid`.
    pub(super) fn layout_grid_children(
        &mut self,
        items: &[Item],
        inner: &Basis,
        b: &OptBox,
        depth: usize,
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

        let col_ws = self.column_tracks(b.columns.as_ref(), inner.w, col_gap);
        let cols = col_ws.len();
        let n_grid = items.iter().filter(|i| FlexKind::of(i).is_some()).count();
        // Row spans can reach past the count-derived bound; an explicit
        // track list keeps every authored row regardless of child count.
        let explicit_len = match b.rows.as_ref() {
            Some(shojiku_core::TrackSpec::Tracks(tracks)) => tracks.len(),
            _ => 0,
        };
        let rows_count = n_grid.div_ceil(cols).max(1).max(explicit_len);
        let explicit_rows = self.row_tracks(b.rows.as_ref(), inner, row_gap, rows_count);

        // Column x offsets: leftover width distributes per
        // `justifyContent` (equal-count tracks consume it all, so this
        // only acts on explicit track lists).
        let used: f64 = col_ws.iter().sum::<f64>() + col_gap * (cols - 1) as f64;
        let justify = b.justify_content.unwrap_or_default();
        let (lead, between) = main_spacing(inner.w - used, cols, justify);
        let col_xs = track_offsets(&col_ws, col_gap + between, inner.x + lead);

        // Pass 1: lay out every child in document order. Grid items take
        // The next free cell run from the occupancy map (spans:
        // `columnSpan`/`rowSpan` consume several tracks, clamped to the
        // axis with a diagnostic).
        let mut slots = Vec::new();
        let mut cells: Vec<CellSpan> = Vec::new();
        let mut occupancy = Occupancy::new(cols);
        let mut explicit_rows = explicit_rows;
        for (i, child) in items.iter().enumerate() {
            let mark = self.enter_item(format!("items[{i}]"));
            match FlexKind::of(child) {
                Some(kind) => {
                    let (cs, rs) = self.clamped_spans(&kind.box_(), cols);
                    let cell = occupancy.place(cs, rs, direction, rows_count);
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
                    };
                    if let Some(atom) = self.flex_child_atom(kind, &basis, depth) {
                        // Horizontal auto margins act within the cell run.
                        slots.push(Slot::Flex(h_auto_margin(atom, &basis)));
                        cells.push(cell);
                    }
                }
                None => {
                    if let Some((atom, dy)) = self.absolute_child_atom(child, inner, depth) {
                        slots.push(Slot::Abs(atom, dy));
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
        let mut row_hs: Vec<f64> = explicit_rows.iter().map(|h| h.unwrap_or(0.0)).collect();
        for (atom, cell) in grid_atoms.iter().zip(&cells) {
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
        for (atom, cell) in grid_atoms.iter().zip(&cells) {
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
}
