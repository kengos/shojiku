//! Fullwidth-punctuation trimming (half-width punctuation) as a post-shaping advance
//! adjustment — the `textSpacingTrim` mechanism.
//!
//! No bundled face carries the OpenType `chws`/`palt` features across the
//! punctuation range, so trimming is synthesized here from the glyph
//! advances rather than ridden off a font feature: the result is
//! deterministic across faces. A fullwidth punctuation glyph is modelled as
//! a 1em box with the ink in one half and `0.5em` of internal space in the
//! other; trimming removes that space by clamping the advance to half-em
//! (never expanding), and slides an opening bracket left so it hugs the
//! preceding glyph.
//!
//! **Subset.** This implements only trimming *between two adjacent fullwidth
//! punctuation glyphs* (CSS `normal`) and the *line-head opening bracket*
//! (CSS `trim-start`). The full CSS `text-spacing-trim` / JLREQ algorithm
//! (line-end trimming, punctuation-before-ideograph spacing, `space-first`)
//! is not modelled. The class
//! tables overlap the kinsoku bracket sets (`wrap::kinsoku`) but are kept
//! separate: line-start prohibition and internal spacing are different
//! concerns that only coincidentally share bracket characters (that file's
//! header points back here — keep the cross-references paired).
//!
//! One consumer leans on a subtle property of `apply_trim`: a line-END
//! Close glyph is never trimmed (the Close arm requires a fullwidth
//! punctuation AFTER it). `engine/text/block/lines.rs::trailing_advance`
//! measures a hung trailing char untrimmed and subtracts it from a trimmed
//! line width — sound only while that property holds. If line-end trimming
//! (JLREQ) lands here, update that measure in the same change.

use super::PositionedGlyph;
use shojiku_core::TextSpacingTrim;

/// Internal-spacing class of a fullwidth punctuation glyph.
#[derive(Clone, Copy, PartialEq)]
enum Class {
    /// Opening bracket (`「（〔…`): ink hugs the right, empty on the left.
    Open,
    /// Closing bracket / comma / full stop (`」）、。…`): ink hugs the
    /// left, empty on the right.
    Close,
    /// Anything else — never trimmed.
    Other,
}

/// Fullwidth opening brackets (empty left half; empty TOP half once the
/// glyph is a vertical alternate — the vertical trim pass shares this
/// class table so the two axes cannot drift).
pub(in crate::font) fn is_open(c: char) -> bool {
    matches!(
        c,
        '（' | '「' | '｛' | '〔' | '〈' | '《' | '【' | '『' | '［'
    )
}

/// Fullwidth closing brackets plus the ideographic comma / full stop
/// (empty right half; empty BOTTOM half as a vertical alternate — shared
/// with the vertical trim pass). Half-width forms (`｡､｣`) already carry no
/// internal space and are deliberately excluded.
pub(in crate::font) fn is_close(c: char) -> bool {
    matches!(
        c,
        '）' | '」' | '｝' | '〕' | '〉' | '》' | '】' | '』' | '］' | '、' | '。' | '，' | '．'
    )
}

/// The class of a glyph, keyed off the leading char of its source cluster
/// (punctuation is always a single-char cluster). A degenerate/empty source
/// range classifies as [`Class::Other`], so hostile input never trims.
fn classify(text: &str, glyph: &PositionedGlyph) -> Class {
    match text
        .get(glyph.source.start..)
        .and_then(|s| s.chars().next())
    {
        Some(c) if is_open(c) => Class::Open,
        Some(c) if is_close(c) => Class::Close,
        _ => Class::Other,
    }
}

/// Trims fullwidth-punctuation internal spacing in place, then re-lays the
/// pen positions. `line_start` enables the `trim_start` line-head bracket
/// trim; `size` is the em in pt and `letter_spacing` the per-glyph extra
/// advance (excluded from the half-em target). Never called for
/// [`TextSpacingTrim::SpaceAll`] (the caller guards).
pub(super) fn apply_trim(
    glyphs: &mut [PositionedGlyph],
    text: &str,
    trim: TextSpacingTrim,
    line_start: bool,
    size: f64,
    letter_spacing: f64,
) {
    if glyphs.is_empty() {
        return;
    }
    let classes: Vec<Class> = glyphs.iter().map(|g| classify(text, g)).collect();
    let half = 0.5 * size;
    let line_head = line_start && trim == TextSpacingTrim::TrimStart;
    for i in 0..glyphs.len() {
        // Delta = the internal space removed: the glyph's own advance (net
        // of letter spacing) above half-em, never negative (never expands).
        // A glyph already at or below half-em yields delta 0 (a no-op
        // subtraction), so no separate guard is needed.
        let delta = (glyphs[i].advance - letter_spacing - half).max(0.0);
        match classes[i] {
            // Closing punctuation abutting another fullwidth punctuation:
            // drop its trailing space; the glyph stays put (hugs left).
            Class::Close if i + 1 < classes.len() && classes[i + 1] != Class::Other => {
                glyphs[i].advance -= delta;
            }
            // Opening bracket after a fullwidth punctuation, or at the line
            // head under `trim_start`: drop its leading space and slide the
            // glyph left so its ink hugs the preceding character / margin.
            Class::Open if (i > 0 && classes[i - 1] != Class::Other) || (i == 0 && line_head) => {
                glyphs[i].advance -= delta;
                glyphs[i].x_offset -= delta;
            }
            _ => {}
        }
    }
    relayout(glyphs);
}

/// Re-accumulates each glyph's pen `x` from the (possibly trimmed)
/// advances, left to right from the run origin. `x_offset` (the intra-glyph
/// slide) is preserved.
fn relayout(glyphs: &mut [PositionedGlyph]) {
    let mut pen = 0.0;
    for g in glyphs.iter_mut() {
        g.x = pen;
        pen += g.advance;
    }
}

#[cfg(test)]
mod tests;
