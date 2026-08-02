//! Resolved `char_grid` geometry: the pure cell/block → page-coordinate
//! math, writing-mode aware. No fonts, no diagnostics — the arithmetic a
//! sheet build and its tests both rely on.

/// Resolved grid geometry, all in pt. Line/cell indices are
/// writing-mode-relative; [`GridGeom::cell_origin`] maps them to page
/// x/y (vertical lines run right→left).
pub(in crate::engine) struct GridGeom {
    pub cell: f64,
    pub char_gap: f64,
    pub line_gap: f64,
    pub cpl: usize,
    pub lines: usize,
    pub vertical: bool,
    /// Ruby font size before per-run shrink-to-fit.
    pub ruby_size: f64,
}

impl GridGeom {
    /// Grid extent along x.
    pub(super) fn grid_w(&self) -> f64 {
        let (n_main, n_cross) = (self.cpl as f64, self.lines as f64);
        if self.vertical {
            n_cross * self.cell + (n_cross - 1.0) * self.line_gap
        } else {
            n_main * self.cell + (n_main - 1.0) * self.char_gap
        }
    }

    /// One sheet's extent along y.
    pub(super) fn sheet_h(&self) -> f64 {
        let (n_main, n_cross) = (self.cpl as f64, self.lines as f64);
        if self.vertical {
            n_main * self.cell + (n_main - 1.0) * self.char_gap
        } else {
            n_cross * self.cell + (n_cross - 1.0) * self.line_gap
        }
    }

    /// Top-left of a cell, relative to the grid's top-left, for a line
    /// index *within the sheet* and a cell index along the line.
    pub(super) fn cell_origin(&self, line: usize, pos: usize) -> (f64, f64) {
        let (l, p) = (line as f64, pos as f64);
        if self.vertical {
            (
                self.grid_w() - (l + 1.0) * self.cell - l * self.line_gap,
                p * (self.cell + self.char_gap),
            )
        } else {
            (
                p * (self.cell + self.char_gap),
                l * (self.cell + self.line_gap),
            )
        }
    }

    /// A `scale × scale` large-writing block's rect `(x, y, w, h)` relative to the
    /// grid's top-left, for a block whose top-left cell is `(line, pos)`
    /// (`line` the block's TOP line, `pos` its first cell). `scale == 1`
    /// reduces to one cell. In `vertical_rl` a block's lines run to the
    /// LEFT, so the block's min-x corner is its LAST line.
    pub(super) fn block_rect(&self, line: usize, pos: usize, scale: usize) -> (f64, f64, f64, f64) {
        let s = scale as f64;
        let along = s * self.cell + (s - 1.0) * self.char_gap;
        let across = s * self.cell + (s - 1.0) * self.line_gap;
        if self.vertical {
            // Lines to the left: the leftmost line of the block is the
            // one with the largest index.
            let (x, _) = self.cell_origin(line + scale - 1, pos);
            let (_, y) = self.cell_origin(line, pos);
            (x, y, across, along)
        } else {
            let (x, y) = self.cell_origin(line, pos);
            (x, y, along, across)
        }
    }
}
