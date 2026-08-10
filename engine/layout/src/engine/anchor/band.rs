//! The rectangle an anchored `ellipse` circles.
//!
//! A target's INKED band, not its padded box: text items carry per-line
//! (or per-column) metrics in `PlacedBox.text`, and circling the box would
//! draw an oval around the leading and the padding as well as the glyphs.
//! A target with no text metrics — a rect, an image, a QR — has no band, so
//! its border box is the honest answer.

use crate::boxes::{BoxRect, PlacedBox, TextMetrics};

/// Clearance between the glyph band and an unsized anchored oval, as a
/// fraction of the band's height. The text `mark:` overlay pads by
/// `0.4em` of the FONT SIZE for the same reason — an oval inscribed in a
/// tight band is widest at mid-height, so its arcs pass straight through
/// the glyphs and it reads as a strikethrough. The band's height stands
/// in for the em here: a deferred mark never sees the target's font.
pub(super) const BAND_PAD_FRACTION: f64 = 0.4;

/// The union of every line's inked extent, in page coordinates.
pub(super) fn glyph_band(b: &PlacedBox) -> BoxRect {
    match b.text.as_ref() {
        Some(TextMetrics::Lines { lines }) if !lines.is_empty() => {
            let left = fold(lines.iter().map(|l| l.x), f64::min);
            let right = fold(lines.iter().map(|l| l.x + l.width), f64::max);
            // `em_top`/`em_bottom` rather than the cap band: an oval drawn
            // to cap height clips descenders and every CJK glyph, which
            // fill the em box by design.
            let top = fold(lines.iter().map(|l| l.em_top), f64::min);
            let bottom = fold(lines.iter().map(|l| l.em_bottom), f64::max);
            rect(left, top, right, bottom)
        }
        Some(TextMetrics::Columns { columns }) if !columns.is_empty() => {
            let left = fold(columns.iter().map(|c| c.em_left), f64::min);
            let right = fold(columns.iter().map(|c| c.em_right), f64::max);
            let top = fold(columns.iter().map(|c| c.y), f64::min);
            let bottom = fold(columns.iter().map(|c| c.y + c.height), f64::max);
            rect(left, top, right, bottom)
        }
        // Present-but-empty metrics (a text item that drew no line) fall
        // back with everything else: there is no band to read.
        _ => b.border,
    }
}

fn fold(values: impl Iterator<Item = f64>, pick: fn(f64, f64) -> f64) -> f64 {
    values.fold(
        f64::NAN,
        |acc, v| if acc.is_nan() { v } else { pick(acc, v) },
    )
}

fn rect(left: f64, top: f64, right: f64, bottom: f64) -> BoxRect {
    BoxRect {
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
    }
}
