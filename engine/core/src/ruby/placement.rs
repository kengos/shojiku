//! Per-line placement asked for by an aozora `［＃…］` note: where the
//! source line's characters sit along their line. Layout owns the cell
//! math; this is only the authored intent.

/// Where one source line's characters sit along the line. Produced by
/// the placement notes (`［＃２字下げ］` / `［＃地付き］` /
/// `［＃地から２字上げ］` / `［＃中央］`) and claimed by the segment that
/// starts the line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinePlacement {
    /// `［＃Ｎ字下げ］`: the line's FIRST cell row starts `n` cells in.
    /// Wrapped continuation rows start at the line head, per the
    /// genkoyoshi convention.
    Indent(usize),
    /// `［＃地付き］` (`raise: 0`) / `［＃地からＮ字上げ］`: the line's
    /// characters sit at its END, leaving `raise` cells after them.
    FlushEnd { raise: usize },
    /// `［＃中央］`: the line's characters center along it. A Shojiku
    /// extension — Aozora Bunko has no centering notation.
    Center,
}
