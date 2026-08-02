//! Vertical half-width punctuation: fullwidth-punctuation trimming over an arranged
//! column — the `textSpacingTrim` mechanism with the axes swapped. The
//! class tables are shared with the horizontal pass
//! (`crate::font::shape::trim`) so the two axes cannot drift; the model is
//! the same: a fullwidth punctuation glyph is a 1em cell with the ink in
//! one half — in a vertical column an opening bracket's ink hugs the
//! BOTTOM (its content follows below) and a closing bracket / comma / full
//! stop hugs the TOP — and trimming removes the empty half by clamping the
//! cell advance to half-em, sliding an opening bracket UP so it hugs the
//! preceding glyph (or the column head under `trim_start`). Rotated cells
//! (mixed-orientation Latin) are never fullwidth punctuation and are left
//! alone. A column-END Close cell is never trimmed (the Close arm needs a
//! fullwidth punctuation AFTER it), mirroring the horizontal property the
//! hanging-punctuation measure leans on.

use shojiku_core::TextSpacingTrim;

use super::super::super::shape::{is_close, is_open};
use super::super::VGlyph;

/// Internal-spacing class of an arranged cell.
#[derive(Clone, Copy, PartialEq)]
enum Class {
    /// Opening bracket: ink hugs the cell bottom, empty above.
    Open,
    /// Closing bracket / comma / full stop: ink hugs the cell top,
    /// empty below.
    Close,
    /// Anything else — never trimmed.
    Other,
}

/// The class of a cell, keyed off the leading char of its source cluster
/// (punctuation is always a single-char cluster). Rotated cells and a
/// degenerate/empty source range classify as [`Class::Other`], so hostile
/// input never trims.
fn classify(text: &str, g: &VGlyph) -> Class {
    if g.rotated {
        return Class::Other;
    }
    match text.get(g.source.start..).and_then(|s| s.chars().next()) {
        Some(c) if is_open(c) => Class::Open,
        Some(c) if is_close(c) => Class::Close,
        _ => Class::Other,
    }
}

/// Trims fullwidth-punctuation internal spacing in place, then re-stacks
/// the cell `down` offsets. `column_start` enables the `trim_start`
/// column-head bracket trim; `size` is the em in pt and `letter_spacing`
/// the per-cell extra advance (excluded from the half-em target). Never
/// called for [`TextSpacingTrim::SpaceAll`] (the caller guards).
pub(super) fn apply_vertical_trim(
    glyphs: &mut [VGlyph],
    text: &str,
    trim: TextSpacingTrim,
    column_start: bool,
    size: f64,
    letter_spacing: f64,
) {
    if glyphs.is_empty() {
        return;
    }
    let classes: Vec<Class> = glyphs.iter().map(|g| classify(text, g)).collect();
    let half = 0.5 * size;
    let column_head = column_start && trim == TextSpacingTrim::TrimStart;
    for i in 0..glyphs.len() {
        // Delta = the internal space removed: the cell's own advance (net
        // of letter spacing) above half-em, never negative (never expands).
        let delta = (glyphs[i].advance - letter_spacing - half).max(0.0);
        match classes[i] {
            // Closing punctuation abutting another fullwidth punctuation:
            // drop its trailing (below-ink) space; the glyph stays put.
            Class::Close if i + 1 < classes.len() && classes[i + 1] != Class::Other => {
                glyphs[i].advance -= delta;
            }
            // Opening bracket after a fullwidth punctuation, or at the
            // column head under `trim_start`: drop its leading (above-ink)
            // space and slide the ink up to hug what precedes it.
            Class::Open if (i > 0 && classes[i - 1] != Class::Other) || (i == 0 && column_head) => {
                glyphs[i].advance -= delta;
                glyphs[i].dy -= delta;
            }
            _ => {}
        }
    }
    restack(glyphs);
}

/// Re-accumulates each cell's `down` offset from the (possibly trimmed)
/// advances, top to bottom from the column top. `dy` (the intra-cell
/// slide) is preserved.
fn restack(glyphs: &mut [VGlyph]) {
    let mut down = 0.0;
    for g in glyphs.iter_mut() {
        g.down = down;
        down += g.advance;
    }
}

#[cfg(test)]
mod tests;
