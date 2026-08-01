//! Cut marks for an imposition grid: short ticks just outside
//! the grid's bounding box at every cut position, so the imposed sheet can
//! be cut without measuring.
//!
//! The geometry is pure and `Ctx`-free — the emission side only has to
//! know each page's grid box, so every degenerate sheet (no margin,
//! asymmetric margins, a cap-clamped grid) is unit-testable without
//! crafting a hostile template.

#[cfg(test)]
mod tests;

use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use crate::tree::{LayoutItem, LineShape};

use super::super::flow::FlowLayouter;
use super::super::{Ctx, BLACK};
use super::pages::GridPages;

/// How far a tick reaches out from the grid's edge, before the per-side
/// clamp to the room left on the sheet. Long enough to see and align a
/// blade to, short enough to stay inside a default 25pt page margin.
pub(super) const CUT_MARK_LEN: f64 = 6.0;

/// Tick stroke width (pt): a hairline that prints on office hardware but
/// never reads as content.
pub(super) const CUT_MARK_WIDTH: f64 = 0.25;

/// One page's grid box plus how far a tick may reach on each side before
/// it would run off the sheet. All values are in the body coordinate
/// space the walk places cells in (x page-absolute, y region-relative);
/// the room is measured to the PHYSICAL sheet edge, since the page's top
/// margin is applied as one translate at assembly.
pub(super) struct MarkGeometry {
    /// Grid bounding box: left, top, and the per-axis pitch/count.
    pub left: f64,
    pub top: f64,
    /// Slot size and gap per axis — cut positions fall on the slot edges
    /// and the gap centres between them.
    pub slot: (f64, f64),
    pub gap: (f64, f64),
    pub counts: (usize, usize),
    /// Room to the sheet edge on each side, in `[top, right, bottom, left]`
    /// order (the page-margin convention).
    pub room: [f64; 4],
}

impl MarkGeometry {
    /// Cut positions along one axis: the grid's outer edges plus the
    /// centre of every interior gap. `n` slots yield `n + 1` positions.
    ///
    /// A zero gap collapses the interior position onto the shared slot
    /// edge, which is exactly where the blade goes — so a gapless grid
    /// still marks correctly instead of special-casing.
    fn positions(start: f64, slot: f64, gap: f64, n: usize) -> Vec<f64> {
        let pitch = slot + gap;
        let mut out = Vec::with_capacity(n + 1);
        out.push(start);
        for i in 1..n {
            out.push(start + i as f64 * pitch - gap / 2.0);
        }
        out.push(start + n.saturating_sub(1) as f64 * pitch + slot);
        out
    }

    /// The grid's right edge / bottom edge. Saturating so a zero count —
    /// which the callers already exclude — can never underflow the
    /// subtraction into a huge extent.
    fn extent(slot: f64, gap: f64, n: usize) -> f64 {
        n as f64 * slot + n.saturating_sub(1) as f64 * gap
    }
}

/// Which sides had no room for their ticks, in the order the two cut
/// loops visit them. Empty means every tick was drawn.
pub(super) struct Clipped(pub Vec<&'static str>);

/// The page-margin side order (`[top, right, bottom, left]`), which the
/// diagnostic reports in so a reader can line the sides up with the
/// `margin` they authored.
const SIDES: [&str; 4] = ["top", "right", "bottom", "left"];

impl Clipped {
    /// The joined side names for the diagnostic's `sides` arg, in the
    /// page-margin order rather than the order the loops found them.
    pub(super) fn sides(&self) -> String {
        SIDES
            .iter()
            .filter(|side| self.0.contains(*side))
            .copied()
            .collect::<Vec<_>>()
            .join(", ")
    }
}

/// Builds one page's cut marks. Every cut position gets two ticks — one at
/// each end of the cut — reaching OUTWARD from the grid so no ink lands on
/// a cell. A side whose room is non-positive draws nothing and is reported
/// through [`Clipped`]; a side with less than [`CUT_MARK_LEN`] of room
/// draws a shorter tick rather than none.
///
/// A degenerate grid (a non-finite or non-positive slot, a zero count)
/// draws nothing: there is no meaningful cut line to mark, and the caller
/// has already warned about the geometry that produced it.
pub(super) fn cut_marks(geometry: &MarkGeometry) -> (Vec<LineShape>, Clipped) {
    let (cols, rows) = geometry.counts;
    let (slot_w, slot_h) = geometry.slot;
    let (col_gap, row_gap) = geometry.gap;
    let mut clipped = Clipped(Vec::new());
    if cols == 0 || rows == 0 || !usable(slot_w) || !usable(slot_h) {
        return (Vec::new(), clipped);
    }

    let right = geometry.left + MarkGeometry::extent(slot_w, col_gap, cols);
    let bottom = geometry.top + MarkGeometry::extent(slot_h, row_gap, rows);
    let mut out = Vec::new();

    // A vertical cut is marked above the grid and below it.
    let xs = MarkGeometry::positions(geometry.left, slot_w, col_gap, cols);
    for (len, label, from, sign) in [
        (geometry.room[0], "top", geometry.top, -1.0),
        (geometry.room[2], "bottom", bottom, 1.0),
    ] {
        let Some(len) = tick_len(len, label, &mut clipped) else {
            continue;
        };
        out.extend(xs.iter().map(|&x| tick(x, from, x, from + sign * len)));
    }

    // A horizontal cut is marked left of the grid and right of it.
    let ys = MarkGeometry::positions(geometry.top, slot_h, row_gap, rows);
    for (len, label, from, sign) in [
        (geometry.room[3], "left", geometry.left, -1.0),
        (geometry.room[1], "right", right, 1.0),
    ] {
        let Some(len) = tick_len(len, label, &mut clipped) else {
            continue;
        };
        out.extend(ys.iter().map(|&y| tick(from, y, from + sign * len, y)));
    }
    (out, clipped)
}

/// The grid geometry shared by every page of one `repeat`: the cells are
/// identical on each page (an imposed sheet gets physically cut), so only
/// the row count and the grid top vary.
pub(super) struct Sheet {
    pub region_x: f64,
    pub slot: (f64, f64),
    pub gap: (f64, f64),
    pub cols: usize,
}

impl Ctx<'_, '_> {
    /// Draws the trim guides for every page the grid occupies. Marks
    /// follow each page's OWN row count (a `breakBefore: auto` first page
    /// is shorter) and always describe the FULL grid — a half-filled last
    /// sheet is still cut into the same pieces.
    ///
    /// `cut_marks_clipped` reports the FIRST page that lost ticks: a
    /// short first page has more room above it than the pages after it,
    /// so the sides can differ, and one warning per `repeat` is the
    /// author-facing signal (the diagnostics dedup would collapse the
    /// rest anyway — they share the item's path).
    pub(super) fn place_cut_marks(
        &mut self,
        plan: &GridPages,
        sheet: &Sheet,
        (base, last_page): (usize, usize),
        layouter: &mut FlowLayouter,
    ) {
        let (page_w, page_h) = self.input.template.page.dimensions_pt();
        let margin = self.page_margin;
        let mut clipped_sides = String::new();
        // Iterating the pages themselves (rather than indexing by number)
        // keeps the walk total: every page in `base..=base + last_page`
        // exists by construction — `last_page` only advances when a cell
        // actually landed — and a shorter run simply marks fewer sheets.
        for (page, build) in layouter
            .pages
            .iter_mut()
            .skip(base)
            .take(last_page + 1)
            .enumerate()
        {
            let rows = plan.page_rows(page);
            let top = plan.page_top(page);
            let right =
                sheet.region_x + MarkGeometry::extent(sheet.slot.0, sheet.gap.0, sheet.cols);
            let bottom = top + MarkGeometry::extent(sheet.slot.1, sheet.gap.1, rows);
            let geometry = MarkGeometry {
                left: sheet.region_x,
                top,
                slot: sheet.slot,
                gap: sheet.gap,
                counts: (sheet.cols, rows),
                // Body y maps to sheet y by the top margin, so the room
                // above the grid reaches to `-margin[0]` and the room
                // below to the sheet bottom at `page_h - margin[0]`.
                room: [
                    top + margin[0],
                    page_w - right,
                    (page_h - margin[0]) - bottom,
                    sheet.region_x,
                ],
            };
            let (lines, clipped) = cut_marks(&geometry);
            if clipped_sides.is_empty() {
                clipped_sides = clipped.sides();
            }
            build.items.extend(lines.into_iter().map(LayoutItem::Line));
        }
        if !clipped_sides.is_empty() {
            self.diags.push(
                Diagnostic::new(Code::CutMarksClipped)
                    .arg("sides", clipped_sides)
                    .with_path(self.current_path()),
            );
        }
    }
}

/// A slot side usable as a cut geometry: finite and positive. Zero-sized
/// slots come from a region a hostile gap consumed entirely.
fn usable(side: f64) -> bool {
    side.is_finite() && side > 0.0
}

/// The tick length on one side: the constant clamped to the room left on
/// the sheet. `None` (and a recorded side) when there is no room at all.
fn tick_len(room: f64, side: &'static str, clipped: &mut Clipped) -> Option<f64> {
    if !room.is_finite() || room <= 0.0 {
        clipped.0.push(side);
        return None;
    }
    Some(room.min(CUT_MARK_LEN))
}

fn tick(x1: f64, y1: f64, x2: f64, y2: f64) -> LineShape {
    LineShape {
        x1,
        y1,
        x2,
        y2,
        width: CUT_MARK_WIDTH,
        color: BLACK,
        ..Default::default()
    }
}
