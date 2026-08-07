//! Greedy text wrapping with CJK-aware break opportunities and optional
//! kinsoku (CJK line-break prohibition — one set serves Japanese and
//! Chinese; see `wrap/kinsoku.rs`). Thai, which writes without
//! inter-word spaces, gets its break opportunities from a word segmenter
//! instead (`wrap/thai.rs`). The engine itself works on
//! styled characters (`wrap/rich.rs`) so plain text and rich spans
//! wrap identically; the plain API here is a one-span convenience.

mod hang;
#[cfg(test)]
mod hung_tests;
mod kinsoku;
mod rich;
#[cfg(test)]
mod tests;
mod thai;
#[cfg(test)]
mod thai_tests;
#[cfg(test)]
mod vertical_tests;
#[cfg(test)]
mod zh_tests;

pub(crate) use kinsoku::{no_line_end, no_line_start};
pub use rich::{wrap_spans, wrap_spans_hung, RichPiece, RichSpan, WrappedLine};

use crate::font::FontFace;
use shojiku_core::{HangingPunctuation, LineBreak};

/// Whether a char may break freely (CJK behavior: break before/after any
/// ideograph or kana).
fn is_cjk(c: char) -> bool {
    matches!(u32::from(c),
        0x1100..=0x11FF      // Hangul Jamo
        | 0x2E80..=0x303F    // CJK radicals, punctuation
        | 0x3040..=0x30FF    // Hiragana, Katakana
        | 0x3130..=0x318F    // Hangul compatibility Jamo
        | 0x3400..=0x4DBF    // CJK ext A
        | 0x4E00..=0x9FFF    // CJK unified
        | 0xAC00..=0xD7AF    // Hangul syllables
        | 0xF900..=0xFAFF    // CJK compatibility
        | 0xFF00..=0xFFEF    // full/half-width forms
    )
}

/// Wraps `text` to fit `max_width` pt at `size` pt, splitting paragraphs on
/// `\n`. `letter_spacing` (pt, may be negative) widens every measured
/// advance, matching [`FontFace::text_width`]. A token wider than the whole
/// line is hard-broken per char. When `line_break` is
/// [`LineBreak::Normal`], kinsoku is applied per paragraph after wrapping;
/// [`LineBreak::Anywhere`] skips it (break anywhere).
pub fn wrap_text(
    face: &FontFace,
    text: &str,
    size: f64,
    max_width: f64,
    line_break: LineBreak,
    letter_spacing: f64,
) -> Vec<String> {
    wrap_text_chain(&[face], text, size, max_width, line_break, letter_spacing)
}

/// Like [`wrap_text`] but measures over a fallback face chain, so a
/// glyph served by a fallback face contributes its real advance to line
/// breaking (measurement and drawing route through the same chain width).
pub fn wrap_text_chain(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    max_width: f64,
    line_break: LineBreak,
    letter_spacing: f64,
) -> Vec<String> {
    let span = RichSpan {
        text,
        faces: chain,
        size,
        letter_spacing,
        orient: None,
        combine: None,
    };
    wrap_spans(std::slice::from_ref(&span), max_width, line_break)
        .into_iter()
        .map(|line| line.into_iter().map(|piece| piece.text).collect())
        .collect()
}

/// Like [`wrap_text_chain`] but hanging-punctuation aware: returns
/// [`WrappedLine`]s so the caller sees which lines end in hung punctuation
/// (excluded from alignment). Used by the plain text block.
pub fn wrap_text_chain_hung(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    max_width: f64,
    line_break: LineBreak,
    letter_spacing: f64,
    hanging: HangingPunctuation,
) -> Vec<WrappedLine> {
    let span = RichSpan {
        text,
        faces: chain,
        size,
        letter_spacing,
        orient: None,
        combine: None,
    };
    wrap_spans_hung(std::slice::from_ref(&span), max_width, line_break, hanging)
}

/// Wraps plain text into vertical columns: the same greedy /
/// kinsoku machinery as [`wrap_text_chain_hung`], but every char is
/// measured by its down-advance so columns break against the region
/// `max_down` (height) instead of a width. Returns [`WrappedLine`]s, one
/// per column, top to bottom (the block builder lays them right to left);
/// `hanging` lets a column-terminating comma / full stop hang past the
/// column bottom (hanging punctuation) exactly like the horizontal end edge.
#[allow(clippy::too_many_arguments)] // measurement inputs, all primitive — wrap_text_chain_hung + orientation
pub fn wrap_vertical(
    chain: &[&FontFace],
    text: &str,
    size: f64,
    max_down: f64,
    line_break: LineBreak,
    letter_spacing: f64,
    orient: shojiku_core::TextOrientation,
    hanging: HangingPunctuation,
    combine: Option<shojiku_core::TextCombine>,
) -> Vec<WrappedLine> {
    let span = RichSpan {
        text,
        faces: chain,
        size,
        letter_spacing,
        orient: Some(orient),
        combine,
    };
    wrap_spans_hung(std::slice::from_ref(&span), max_down, line_break, hanging)
}
