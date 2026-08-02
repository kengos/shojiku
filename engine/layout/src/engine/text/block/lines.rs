//! Plain-text line placement for [`super`]'s `text_block`: wrapping with
//! the block's settings, then measuring and aligning each wrapped line
//! (including the hanging-punctuation exclusion) into placed
//! [`TextLine`]s. The rich counterpart is `super::super::rich`'s `lines`.

use crate::font::{run_width, FontFace, RunOptions};
use crate::style::ComputedStyle;
use crate::tree::TextLine;
use crate::wrap::{wrap_text_chain_hung, WrappedLine};

/// Wraps plain text with the block's line-break and hanging-punctuation
/// settings, giving each line's hung flag. Shared by the initial wrap and
/// the `shrink` re-wrap.
pub(super) fn wrap_plain(
    computed: &ComputedStyle,
    faces: &[&FontFace],
    content: &str,
    size: f64,
    content_w: f64,
    letter_spacing: f64,
) -> Vec<WrappedLine> {
    wrap_text_chain_hung(
        faces,
        content,
        size,
        content_w,
        computed.line_break,
        letter_spacing,
        computed.hanging_punctuation,
    )
}

/// Geometry and style inputs for laying out wrapped lines into placed
/// [`TextLine`]s (bundled to keep [`positioned_lines`] off the argument
/// lint).
pub(super) struct LineLayout<'a> {
    pub faces: &'a [&'a FontFace],
    pub computed: &'a ComputedStyle,
    pub content_x: f64,
    pub content_w: f64,
    pub offset: f64,
    pub line_height: f64,
    pub size: f64,
    pub letter_spacing: f64,
}

/// Measures each wrapped line with the block's trim (every line begins a
/// line, so `trim_start` applies to its first glyph), then aligns it: a
/// hung trailing punctuation is excluded from the alignment width (it hangs
/// into the end margin) but kept in the reported inked width. Consumes the
/// [`WrappedLine`]s whole — text and `hung` travel together, so an overflow
/// policy can never update one without the other.
pub(super) fn positioned_lines(lines: Vec<WrappedLine>, g: &LineLayout) -> Vec<TextLine> {
    lines
        .into_iter()
        .enumerate()
        .map(|(i, line)| {
            let text = line.text();
            let line_w = run_width(
                g.faces,
                &text,
                g.size,
                RunOptions {
                    letter_spacing: g.letter_spacing,
                    trim: g.computed.text_spacing_trim,
                    line_start: true,
                    combine: None,
                },
            );
            let align_w = if line.hung {
                (line_w - trailing_advance(g.faces, &text, g.size, g.letter_spacing)).max(0.0)
            } else {
                line_w
            };
            let lx =
                super::super::align_x(g.computed.text_align, g.content_x, g.content_w, align_w);
            TextLine {
                text,
                x: lx,
                y: g.offset + i as f64 * g.line_height,
                width: line_w,
                runs: Vec::new(),
            }
        })
        .collect()
}

/// Advance of a line's last character (the hung punctuation), to exclude it
/// from the alignment width. Zero for an empty line.
///
/// Measured UNTRIMMED (`spacing_only`) and subtracted from a trimmed
/// `line_w` — correct only because the trim pass never trims a line-END
/// Close glyph: `font/shape/trim.rs` trims a Close only when the NEXT
/// glyph is fullwidth punctuation, and a hung char is by definition last.
/// If line-end trimming (JLREQ) ever lands there, this measure must learn
/// the same trim or the alignment width drifts.
pub(super) fn trailing_advance(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    letter_spacing: f64,
) -> f64 {
    match text.chars().next_back() {
        Some(c) => run_width(
            chain,
            &c.to_string(),
            size,
            RunOptions::spacing_only(letter_spacing),
        ),
        None => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::font::test_support::ja_store;

    #[test]
    fn trailing_advance_measures_the_last_char_and_is_zero_when_empty() {
        let f = ja_store().get("biz-ud-gothic").expect("fixed-pitch face");
        // Fixed-pitch: a fullwidth comma advances exactly 1em (10pt).
        assert!((trailing_advance(&[f], "あ、", 10.0, 0.0) - 10.0).abs() < 1e-9);
        // Empty line → no trailing char to exclude.
        assert_eq!(trailing_advance(&[f], "", 10.0, 0.0), 0.0);
    }
}
