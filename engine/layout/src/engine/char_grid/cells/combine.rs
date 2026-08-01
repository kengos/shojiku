//! tate-chu-yoko (tate-chū-yoko) cell grouping for `char_grid`: the bounded
//! digit-run representation sharing one cell, and its placement. Split
//! from [`super`] (the assignment engine) for the line budget.

use shojiku_core::LinePlacement;

use super::{CellChar, Cursor, Sink};

/// Up to four ASCII digits sharing one cell (tate-chu-yoko) — fixed-size so
/// [`CellChar`] stays `Copy` and untrusted content length cannot grow it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::engine) struct CombinedDigits {
    len: u8,
    digits: [u8; 4],
}

impl CombinedDigits {
    /// Builds from an ASCII digit run of length 2..=4; anything else is
    /// not a combinable group and returns `None`.
    pub(in crate::engine) fn new(run: &[char]) -> Option<Self> {
        if !(2..=4).contains(&run.len()) || !run.iter().all(char::is_ascii_digit) {
            return None;
        }
        let mut digits = [0u8; 4];
        for (i, c) in run.iter().enumerate() {
            digits[i] = *c as u8;
        }
        Some(Self {
            len: run.len() as u8,
            digits,
        })
    }

    /// The run as text.
    pub fn text(&self) -> String {
        self.digits[..self.len as usize]
            .iter()
            .map(|b| *b as char)
            .collect()
    }
}

/// Places one tate-chu-yoko digit group in a single cell, wrapping a full line
/// first (digits carry no kinsoku prohibitions).
pub(super) fn place_combined(
    sink: &mut Sink,
    cur: &mut Cursor,
    d: CombinedDigits,
    seg: usize,
    cpl: usize,
    placement: Option<LinePlacement>,
) {
    if cur.pos >= cpl {
        cur.line += 1;
        cur.pos = 0;
    }
    sink.push(CellChar {
        line: cur.line,
        pos: cur.pos,
        ch: d.digits[0] as char,
        combined: Some(d),
        hang: false,
        seg,
        scale: 1,
        placement,
    });
    cur.pos += 1;
    cur.fresh_line = false;
}
