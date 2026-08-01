//! Cell assignment for `char_grid`: sequential fill with the school
//! kinsoku rule set, `［＃改ページ］` sheet breaks, large-writing span blocks, and
//! the per-line placement notes. Pure functions so hostile inputs are
//! unit-testable without layout plumbing. The `textAlign`/placement
//! end-shift lives in [`align`], the span block placement in [`span`].

mod align;
mod combine;
mod place;
mod span;

pub(super) use align::align_cells;
use combine::place_combined;
pub(in crate::engine) use combine::CombinedDigits;
use place::place_wrapped;

use shojiku_core::{KinsokuMode, LinePlacement, RubySegment};

/// One placed character: which line and cell it occupies, whether it
/// hangs back into an already-occupied cell (hanging punctuation), how many cells it
/// spans (large-writing), and the placement of its source line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::engine) struct CellChar {
    /// 0-based line index across the whole content (sheets slice this).
    /// For a span it is the block's TOP line.
    pub line: usize,
    /// 0-based cell index along the line. For a span it is the block's
    /// first (leftmost) cell.
    pub pos: usize,
    pub ch: char,
    /// tate-chu-yoko: the full digit run sharing this cell (`ch` is its first
    /// digit). `None` = the ordinary one-char cell.
    pub combined: Option<CombinedDigits>,
    /// Drawn in the corner of an occupied cell instead of its own.
    pub hang: bool,
    /// Index into the source segments (ruby association).
    pub seg: usize,
    /// Cells this char spans along each axis (large-writing): `1` = ordinary,
    /// `n` = an n×n block. Uniform within a block row.
    pub scale: usize,
    /// The placement of the source line this char sits on; `None` = the
    /// line uses the item's own `textAlign`. Read by [`align_cells`].
    pub placement: Option<LinePlacement>,
}

impl CellChar {
    /// The cell's drawn text: the combined digit run, or the single char.
    pub fn text(&self) -> String {
        match &self.combined {
            Some(d) => d.text(),
            None => self.ch.to_string(),
        }
    }
}

/// Bounded cell collector: placements past `cap` are counted, not
/// stored, so untrusted content length cannot drive memory.
struct Sink {
    cells: Vec<CellChar>,
    cap: usize,
    overflow: usize,
}

impl Sink {
    fn push(&mut self, cell: CellChar) {
        if self.cells.len() < self.cap {
            self.cells.push(cell);
        } else {
            self.overflow += 1;
        }
    }
}

/// The running fill position and the current source line's placement.
struct Cursor {
    line: usize,
    pos: usize,
    /// No character has been placed on the current source line yet — the
    /// point at which an `Indent` placement offsets the start.
    fresh_line: bool,
}

/// Assigns every content character to a cell, storing at most
/// `max_cells` placements (the rest are counted in the returned
/// overflow). `chars_per_line >= 1` (caller clamps); `\n` starts a new
/// line, `\r` is skipped, a segment's `sheet_break` jumps to the next
/// sheet, a segment's `scale` draws its chars as n×n blocks, and a
/// segment's `placement` governs its source line. Scale/indent values are
/// pre-clamped by the caller. Lines are unbounded here — sheet slicing is
/// the caller's job.
pub(super) fn assign_cells(
    segments: &[RubySegment],
    chars_per_line: usize,
    lines_per_sheet: usize,
    kinsoku: KinsokuMode,
    max_cells: usize,
    combine: Option<u8>,
) -> (Vec<CellChar>, usize) {
    let mut sink = Sink {
        cells: Vec::new(),
        cap: max_cells,
        overflow: 0,
    };
    let mut cur = Cursor {
        line: 0,
        pos: 0,
        fresh_line: true,
    };
    for (seg, segment) in segments.iter().enumerate() {
        if segment.sheet_break {
            (cur.line, cur.pos) = break_to_sheet(cur.line, cur.pos, lines_per_sheet);
            cur.fresh_line = true;
        }
        if cur.fresh_line {
            if let Some(LinePlacement::Indent(n)) = segment.placement {
                cur.pos = n.min(chars_per_line.saturating_sub(1));
            }
        }
        match segment.scale {
            Some(scale) => span::place_span(
                &mut sink,
                &mut cur,
                segment,
                seg,
                scale,
                chars_per_line,
                lines_per_sheet,
            ),
            None => place_run(
                &mut sink,
                &mut cur,
                segment,
                seg,
                chars_per_line,
                kinsoku,
                combine,
            ),
        }
    }
    (sink.cells, sink.overflow)
}

/// Places one ordinary (non-span) segment's characters, honoring `\n`,
/// `\r`, the school kinsoku rules, and tate-chu-yoko digit grouping (a run of
/// 2..=`combine` consecutive ASCII digits shares one cell; a LONGER run
/// is wholly uncombined — the CSS `digits` rule — so no suffix of it
/// re-combines).
fn place_run(
    sink: &mut Sink,
    cur: &mut Cursor,
    segment: &RubySegment,
    seg: usize,
    cpl: usize,
    kinsoku: KinsokuMode,
    combine: Option<u8>,
) {
    let chars: Vec<char> = segment.text.chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        let ch = chars[i];
        if combine.is_some() && ch.is_ascii_digit() {
            let run = chars[i..].iter().take_while(|c| c.is_ascii_digit()).count();
            let group = (run <= combine.unwrap_or(0) as usize)
                .then(|| CombinedDigits::new(&chars[i..i + run]))
                .flatten();
            match group {
                Some(d) => place_combined(sink, cur, d, seg, cpl, segment.placement),
                None => {
                    for &c in &chars[i..i + run] {
                        place_wrapped(sink, cur, c, seg, cpl, kinsoku, segment.placement);
                    }
                }
            }
            i += run;
            continue;
        }
        match ch {
            '\r' => {}
            '\n' => {
                cur.line += 1;
                cur.pos = 0;
                cur.fresh_line = true;
            }
            ch => place_wrapped(sink, cur, ch, seg, cpl, kinsoku, segment.placement),
        }
        i += 1;
    }
}

/// The cursor after a `［＃改ページ］`: the first cell of the next sheet.
/// A break already at a fresh sheet's first cell is a no-op, so leading
/// and consecutive breaks collapse (the `type: page_break` rule, one
/// level down). Saturating: hostile content cannot wrap the line index.
fn break_to_sheet(line: usize, pos: usize, lines_per_sheet: usize) -> (usize, usize) {
    let per_sheet = lines_per_sheet.max(1);
    if pos == 0 && line.is_multiple_of(per_sheet) {
        return (line, pos);
    }
    (next_sheet_start(line, per_sheet), 0)
}

/// The first line of the sheet after the one `line` sits on.
pub(super) fn next_sheet_start(line: usize, per_sheet: usize) -> usize {
    let per_sheet = per_sheet.max(1);
    (line / per_sheet)
        .saturating_add(1)
        .saturating_mul(per_sheet)
}
