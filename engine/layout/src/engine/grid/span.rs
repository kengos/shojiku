//! Grid span placement: the occupancy map that assigns each grid
//! child its `(column, row)` cell honoring `columnSpan`/`rowSpan`.
//! Pure — unit-testable without an engine context.

use shojiku_core::FlexDirection;

/// One placed child: origin cell + effective (clamped) spans.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct CellSpan {
    pub col: usize,
    pub row: usize,
    pub cols: usize,
    pub rows: usize,
}

/// Row-major occupancy over a fixed column count; rows grow on demand.
pub(super) struct Occupancy {
    cols: usize,
    taken: Vec<bool>,
}

impl Occupancy {
    pub(super) fn new(cols: usize) -> Self {
        Occupancy {
            cols: cols.max(1),
            taken: Vec::new(),
        }
    }

    fn ensure_rows(&mut self, rows: usize) {
        let need = rows * self.cols;
        if self.taken.len() < need {
            self.taken.resize(need, false);
        }
    }

    fn is_free(&mut self, col: usize, row: usize, cs: usize, rs: usize) -> bool {
        self.ensure_rows(row + rs);
        (row..row + rs).all(|r| (col..col + cs).all(|c| !self.taken[r * self.cols + c]))
    }

    fn mark(&mut self, col: usize, row: usize, cs: usize, rs: usize) {
        self.ensure_rows(row + rs);
        for r in row..row + rs {
            for c in col..col + cs {
                self.taken[r * self.cols + c] = true;
            }
        }
    }

    /// Places a `cs × rs` child at the first free position in fill
    /// order. `wrap_rows` bounds the row axis for `column` fill (the
    /// precomputed row count); the row axis grows freely under `row`
    /// fill. Spans arrive pre-clamped to the axis sizes, so a fit
    /// always exists.
    pub(super) fn place(
        &mut self,
        cs: usize,
        rs: usize,
        direction: FlexDirection,
        wrap_rows: usize,
    ) -> CellSpan {
        let cols = self.cols;
        match direction {
            FlexDirection::Row => {
                let mut index = 0;
                loop {
                    let (col, row) = (index % cols, index / cols);
                    if col + cs <= cols && self.is_free(col, row, cs, rs) {
                        self.mark(col, row, cs, rs);
                        return CellSpan {
                            col,
                            row,
                            cols: cs,
                            rows: rs,
                        };
                    }
                    index += 1;
                }
            }
            FlexDirection::Column => {
                // Column fill wraps at the row bound; when the bounded
                // grid is full, grow it by one implicit row and rescan
                // (terminates: fresh rows are free and `cs ≤ cols`).
                let mut wrap = wrap_rows.max(rs);
                loop {
                    for index in 0..cols * wrap {
                        let (col, row) = (index / wrap, index % wrap);
                        if row + rs <= wrap && col + cs <= cols && self.is_free(col, row, cs, rs) {
                            self.mark(col, row, cs, rs);
                            return CellSpan {
                                col,
                                row,
                                cols: cs,
                                rows: rs,
                            };
                        }
                    }
                    wrap += 1;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests;
