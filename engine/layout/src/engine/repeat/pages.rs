//! Pure imposition page math: how many grid rows fit on the first page,
//! and which page/slot each bound element lands in. Free of `Ctx`, fonts
//! and diagnostics, so every degenerate input is unit-testable without
//! crafting a hostile template.

#[cfg(test)]
mod tests;

use shojiku_core::GridDirection;

/// How many full-height grid rows fit in `avail` (the region left under
/// the flow cursor), capped at the grid's authored `rows`.
///
/// Rows are laid at a fixed pitch (`slot_h + row_gap`) and the trailing gap
/// is not needed, hence the `+ row_gap` before the division. **Total**: a
/// non-finite or non-positive `avail` fits nothing; a non-positive pitch
/// (degenerate zero-height slots, or a gap authored negative enough to
/// cancel one) means every row "fits" — matching what the full-region grid
/// does with the same numbers, so `auto` never disagrees with the default.
pub(super) fn first_page_rows(avail: f64, slot_h: f64, row_gap: f64, rows: usize) -> usize {
    let pitch = slot_h + row_gap;
    if pitch.is_nan() || pitch <= 0.0 {
        return rows;
    }
    if avail.is_nan() || avail <= 0.0 {
        return 0;
    }
    let fitting = ((avail + row_gap) / pitch).floor();
    if fitting.is_nan() || fitting <= 0.0 {
        return 0;
    }
    // `as` saturates, and `rows` (already clamped to the per-page cap) bounds
    // the result regardless of how tiny the pitch is.
    (fitting as usize).min(rows)
}

/// Where one element's cell lands: the page (offset from the grid's first
/// page) and its column/row plus the y its page's grid starts at.
pub(super) struct Placement {
    pub(super) page: usize,
    pub(super) col: usize,
    pub(super) row: usize,
    /// The top edge of this page's grid (the cursor on a started first
    /// page, the region top on every page the grid owns outright).
    pub(super) top: f64,
}

/// The grid's page plan: a first page that may be short (started at the
/// cursor by `breakBefore: auto`), then full-size pages.
///
/// Cell GEOMETRY is identical on every page — only the first page's row
/// COUNT shrinks — because imposition output gets physically cut.
pub(super) struct GridPages {
    pub(super) cols: usize,
    /// Rows on every page after the first.
    pub(super) rows: usize,
    /// Rows on the first page (`== rows` when the grid starts fresh).
    pub(super) first_rows: usize,
    /// The first page's grid top.
    pub(super) first_top: f64,
    /// The grid top of every page after the first.
    pub(super) region_top: f64,
    pub(super) direction: GridDirection,
}

impl GridPages {
    /// Rows the grid draws on one of its pages (page 0 = the grid's
    /// first). Only the first page's count can be short.
    pub(super) fn page_rows(&self, page: usize) -> usize {
        if page == 0 {
            self.first_rows
        } else {
            self.rows
        }
    }

    /// The grid top on one of its pages — the cursor on a `breakBefore:
    /// auto` first page, the region top on every page it owns outright.
    pub(super) fn page_top(&self, page: usize) -> f64 {
        if page == 0 {
            self.first_top
        } else {
            self.region_top
        }
    }

    /// Cells on the first page.
    fn first_count(&self) -> usize {
        self.cols * self.first_rows
    }

    /// Cells on every page after the first.
    fn per_page(&self) -> usize {
        self.cols * self.rows
    }

    /// Locates the `i`-th bound element. `cols`/`rows` are pre-clamped to
    /// at least 1 by the caller, so the fill-order divisions below never
    /// divide by zero (a zero `first_rows` is unreachable: the caller falls
    /// back to a fresh full page instead of planning an empty one).
    pub(super) fn locate(&self, i: usize) -> Placement {
        let first = self.first_count();
        let (page, pos, rows_on_page, top) = if i < first {
            (0, i, self.first_rows, self.first_top)
        } else {
            let past = i - first;
            let per_page = self.per_page();
            (
                1 + past / per_page,
                past % per_page,
                self.rows,
                self.region_top,
            )
        };
        let (col, row) = match self.direction {
            GridDirection::Row => (pos % self.cols, pos / self.cols),
            GridDirection::Column => (pos / rows_on_page, pos % rows_on_page),
        };
        Placement {
            page,
            col,
            row,
            top,
        }
    }
}
