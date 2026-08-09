//! Cell assignment and `auto` column measurement.
//!
//! An `auto` column is as wide as the widest cell placed in it, so the
//! grid walk has to know WHICH cells land where before it can size the
//! tracks — the reverse of the order the rest of the walk wants. That is
//! why assignment is lifted out here and runs exactly once: `clamped_spans`
//! warns (`grid_span_clamped`), so a second placement pass would emit
//! every span diagnostic twice.

use shojiku_core::{GridTrack, Item, TrackSpec};

use super::super::flex::FlexKind;
use super::super::visibility::Visibility;
use super::super::{Basis, Ctx};
use super::span::{CellSpan, Occupancy};
use super::tracks::FrRows;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Assigns every grid-participating child its cell, in document
    /// order, paired with the child's index. Absolutely positioned
    /// children (authored `box.x`/`box.y`) are not grid items and are
    /// absent from the result.
    ///
    /// Each entry carries the child's KIND alongside its index: this pass
    /// is the one that classifies, so every later pass can be handed the
    /// answer instead of re-deriving it and needing a branch for a case
    /// this filter has already excluded.
    pub(super) fn plan_cells<'i>(
        &mut self,
        items: &'i [Item],
        visibility: &[Visibility],
        cols: usize,
        direction: shojiku_core::FlexDirection,
        rows_count: usize,
    ) -> Vec<(usize, FlexKind<'i>, CellSpan)> {
        let mut occupancy = Occupancy::new(cols);
        let mut out = Vec::new();
        for (i, child) in items.iter().enumerate() {
            // A collapsed child occupies no cell — otherwise the grid
            // keeps a hole where it would have been.
            if visibility[i].is_collapsed() {
                continue;
            }
            let Some(kind) = FlexKind::of(child) else {
                continue;
            };
            // The span clamp belongs to the CHILD that authored it.
            let mark = self.enter_item(format!("items[{i}]"));
            let (cs, rs) = self.clamped_spans(&kind.box_(), cols);
            self.leave_item(mark);
            out.push((i, kind, occupancy.place(cs, rs, direction, rows_count)));
        }
        out
    }

    /// The max-content width of each `auto` column: the widest cell
    /// placed in it. Returns one entry per column, `0.0` for columns
    /// that are not `auto` (they never read it).
    ///
    /// Only children occupying a SINGLE column contribute. CSS spreads a
    /// spanning child's contribution across the tracks it covers; doing
    /// that needs the other tracks' sizes, which is the circularity this
    /// pre-pass exists to avoid. A grid whose `auto` column holds nothing
    /// but spanning children therefore sizes to 0 and the leftover goes
    /// to its neighbours — stated on docs/engine/grid.md rather than left
    /// to be discovered.
    pub(super) fn auto_column_widths(
        &mut self,
        cells: &[(usize, FlexKind, CellSpan)],
        spec: Option<&TrackSpec>,
        inner: &Basis,
        cols: usize,
        depth: usize,
    ) -> Vec<f64> {
        let mut widths = vec![0.0_f64; cols];
        if !has_auto(spec) {
            return widths;
        }
        for (index, kind, cell) in cells {
            if cell.cols != 1 || cell.col >= cols {
                continue;
            }
            let child_box = kind.box_();
            // An authored `w` IS the cell's width demand; otherwise the
            // child is measured like any other unsized box.
            let mark = self.enter_item(format!("items[{index}]"));
            let measured = match self.resolve_x(child_box.w, inner) {
                Some(w) => Some(w),
                None => self.max_content_width(kind, inner, depth),
            };
            self.leave_item(mark);
            if let Some(w) = measured {
                widths[cell.col] = widths[cell.col].max(w.max(0.0));
            }
        }
        widths
    }

    /// The total height the AUTO rows will take, so the `fr` split can
    /// subtract it. `None` when there is nothing to correct — no `fr`
    /// rows, no definite height to split, or no auto row holding a cell —
    /// and in that case not a single placement is spent.
    ///
    /// Runs parked: this placement is thrown away and only the real one
    /// that follows describes what the author gets. It draws from the
    /// same re-flow budget the auto-height stretch row spends, which is
    /// what bounds a grid of grids where every row is an `fr`.
    ///
    /// Only children occupying a SINGLE row contribute, mirroring
    /// `auto_column_widths` and for a sharper version of the same reason.
    /// A row-spanning child pours its overflow into its LAST spanned row
    /// only after the rows it spans have sizes — so if those include an
    /// `fr`, what it adds to the auto row depends on the very number this
    /// is computing. That one really is circular; it is stated on
    /// docs/engine/grid.md rather than left to be discovered.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn measure_auto_rows(
        &mut self,
        cells: &[(usize, FlexKind, CellSpan)],
        explicit_rows: &[Option<f64>],
        fr_rows: &FrRows,
        col_ws: &[f64],
        col_xs: &[f64],
        col_gap: f64,
        inner: &Basis,
        depth: usize,
    ) -> Option<f64> {
        if fr_rows.frs.is_empty() || inner.h.is_none() {
            return None;
        }
        // An auto row is one the track pass left unsized; only those that
        // actually hold a single-row cell can contribute a height.
        let measurable: Vec<&(usize, FlexKind, CellSpan)> = cells
            .iter()
            .filter(|(_, _, c)| {
                c.rows == 1 && c.col < col_ws.len() && explicit_rows.get(c.row) == Some(&None)
            })
            .collect();
        if measurable.is_empty() || !self.spend_reflow(measurable.len()) {
            return None;
        }
        let parked = self.begin_measure();
        let mut heights: Vec<(usize, f64)> = Vec::new();
        for (_, kind, cell) in measurable {
            let w = col_ws[cell.col..cell.col + cell.cols].iter().sum::<f64>()
                + col_gap * (cell.cols - 1) as f64;
            let basis = Basis {
                x: col_xs[cell.col],
                w,
                // The row is auto: nothing constrains the cell's height,
                // which is exactly why it can be measured before the `fr`
                // rows are known.
                h: None,
                font: inner.font,
                pct_w: None,
                fill_h: None,
            };
            if let Some(atom) = self.flex_child_atom(*kind, &basis, depth) {
                match heights.iter_mut().find(|(r, _)| *r == cell.row) {
                    Some((_, h)) => *h = h.max(atom.height),
                    None => heights.push((cell.row, atom.height)),
                }
            }
        }
        self.end_measure(parked);
        Some(heights.iter().map(|(_, h)| *h).sum())
    }
}

/// Whether a track spec authors any `auto` column — the gate on the
/// whole measurement, since it is pure cost for the common case.
pub(super) fn has_auto(spec: Option<&TrackSpec>) -> bool {
    matches!(spec, Some(TrackSpec::Tracks(list)) if list.contains(&GridTrack::Auto))
}

/// The column count a track spec implies, before any size is resolved —
/// what cell assignment needs and track sizing cannot yet give.
///
/// Clamped exactly as `column_tracks` clamps it, but SILENTLY: that
/// function still runs and still emits `grid_tracks_clamped`, so warning
/// here too would report a hostile track count twice.
pub(super) fn spec_columns(spec: Option<&TrackSpec>) -> usize {
    let authored = match spec {
        Some(TrackSpec::Count(n)) => *n,
        Some(TrackSpec::Tracks(list)) if !list.is_empty() => list.len(),
        _ => 1,
    };
    authored.clamp(1, shojiku_core::MAX_GRID_TRACKS)
}
