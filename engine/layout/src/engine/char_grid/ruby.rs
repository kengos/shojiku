//! Ruby (furigana) placement for `char_grid`: each annotated base run
//! gets its reading laid along the run — above it (horizontal) or to its
//! right (vertical, as a real vertical column the renderers shape with
//! GSUB `vert`) — shrunk to fit the run's extent with a 4pt floor.

use crate::font::{run_width, vertical_extent, FontFace, RunOptions};
use crate::tree::{LayoutItem, TextLine};
use shojiku_core::TextOrientation;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::sheet::{text_block, vertical_block, BlockPaint};
use super::{Ctx, GridPrep};

/// Readings smaller than this are unreadable in print; the shrink stops
/// here and the run overflows its base extent (warned once per sheet).
const MIN_RUBY_PT: f64 = 4.0;

/// One line-contiguous slice of a base run: the cells a reading part
/// covers on a single line.
struct BaseRun {
    line: usize,
    first_pos: usize,
    cells: usize,
    /// Cells each base char spans (large-writing); `1` = ordinary. A block run
    /// occupies `cells × scale` contiguous grid-cells along the line.
    scale: usize,
    ruby: Vec<char>,
}

impl BaseRun {
    /// Grid-cells the run occupies along the line (blocks are adjacent in
    /// grid-cell terms), driving the reading's extent.
    fn grid_cells(&self) -> usize {
        self.cells * self.scale
    }
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Appends this sheet's ruby blocks. Readings split proportionally
    /// when their base run wraps across lines (or sheets).
    pub(super) fn push_ruby(
        &mut self,
        items: &mut Vec<LayoutItem>,
        prep: &GridPrep,
        sheet: usize,
        faces: &[&FontFace],
        paint: &BlockPaint,
    ) {
        let geom = &prep.geom;
        let (lo, hi) = (sheet * geom.lines, (sheet + 1) * geom.lines);
        let (origin_x, top) = (prep.rb.content_x(), prep.rb.padding[0]);
        let mut overflowed = false;
        for (seg, segment) in prep.segments.iter().enumerate() {
            let Some(reading) = segment.ruby.as_deref() else {
                continue;
            };
            for run in split_runs(prep, seg, reading) {
                if !(lo..hi).contains(&run.line) || run.ruby.is_empty() {
                    continue;
                }
                // A large-writing block run spans `cells × scale` grid-cells along
                // the line; the reading rides that full extent.
                let m = run.grid_cells() as f64;
                let extent = m * geom.cell + (m - 1.0) * geom.char_gap;
                let (cx, cy) = geom.cell_origin(run.line - lo, run.first_pos);
                let text: String = run.ruby.iter().collect();
                if geom.vertical {
                    // A vertical reading is a real column beside the run:
                    // shaped extents (vert advances), shrunk linearly.
                    let mut size = geom.ruby_size;
                    let opts = RunOptions::spacing_only(0.0);
                    let mut total =
                        vertical_extent(faces, &text, size, TextOrientation::Upright, opts);
                    if total > extent && total > 0.0 {
                        size = fit(size, size * extent / total);
                        total = vertical_extent(faces, &text, size, TextOrientation::Upright, opts);
                    }
                    overflowed |= total > extent + 0.01;
                    let line = TextLine {
                        text,
                        x: origin_x + cx + geom.cell + ((geom.line_gap - size) / 2.0).max(0.0),
                        y: top + cy + (extent - total) / 2.0,
                        width: total,
                        runs: Vec::new(),
                    };
                    items.push(vertical_block(paint, size, size, None, vec![line]));
                } else {
                    let mut size = geom.ruby_size;
                    let mut total = run_width(faces, &text, size, RunOptions::spacing_only(0.0));
                    if total > extent && total > 0.0 {
                        // Width is linear in size, so one rescale fits
                        // exactly (subject to the readability floor).
                        size = fit(size, size * extent / total);
                        total = run_width(faces, &text, size, RunOptions::spacing_only(0.0));
                    }
                    overflowed |= total > extent + 0.01;
                    let line = TextLine {
                        text,
                        x: origin_x + cx + (extent - total) / 2.0,
                        y: top + cy - size,
                        width: total,
                        runs: Vec::new(),
                    };
                    items.push(text_block(paint, size, vec![line]));
                }
            }
        }
        if overflowed {
            self.diags
                .push(Diagnostic::new(Code::RubyOverflow).arg("min", MIN_RUBY_PT));
        }
    }
}

/// Shrink-to-fit with the print floor.
fn fit(preferred: f64, fitted: f64) -> f64 {
    preferred.min(fitted).max(MIN_RUBY_PT)
}

/// Splits one segment's reading over its line-contiguous cell runs,
/// proportionally by cell count (a run wrapping two lines of 3+1 cells
/// gets 3/4 then 1/4 of the reading).
fn split_runs(prep: &GridPrep, seg: usize, reading: &str) -> Vec<BaseRun> {
    // (line, first_pos, count, scale) — scale is uniform within a span
    // segment, so the run's first cell carries it.
    let mut groups: Vec<(usize, usize, usize, usize)> = Vec::new();
    for cell in prep.cells.iter().filter(|c| c.seg == seg) {
        match groups.last_mut() {
            Some((line, _, count, _)) if *line == cell.line => *count += 1,
            _ => groups.push((cell.line, cell.pos, 1, cell.scale)),
        }
    }
    let ruby_chars: Vec<char> = reading.chars().collect();
    let total_cells: usize = groups.iter().map(|(_, _, n, _)| n).sum();
    if total_cells == 0 {
        return Vec::new();
    }
    let mut runs = Vec::new();
    let (mut consumed_cells, mut start) = (0usize, 0usize);
    for (i, (line, first_pos, count, scale)) in groups.iter().enumerate() {
        consumed_cells += count;
        let end = if i + 1 == groups.len() {
            ruby_chars.len()
        } else {
            (ruby_chars.len() * consumed_cells + total_cells / 2) / total_cells
        };
        let end = end.clamp(start, ruby_chars.len());
        runs.push(BaseRun {
            line: *line,
            first_pos: *first_pos,
            cells: *count,
            scale: *scale,
            ruby: ruby_chars[start..end].to_vec(),
        });
        start = end;
    }
    runs
}
