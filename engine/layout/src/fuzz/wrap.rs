//! The line-wrapping harness the `layout_wrap` fuzz target and the corpus
//! replay test both run.
//!
//! Params control the text a block wraps, so the wrapper sees any string at
//! any size and width the style guards admit. The harness wraps the body
//! with [`wrap_spans_hung`] and asserts what the wrapper documents: no
//! character is lost or duplicated, every paragraph gives at least one line
//! and the line count is at most the character count plus the paragraph
//! count, a line wider than the box overflows only in its last unit that
//! cannot be split (the characters before that unit fit the box), and a
//! hung line ends in the punctuation that hangs.

use super::input::{Input, LENGTH};
use crate::font::{FontFace, char_width};
use crate::wrap::{
    RichSpan, WrappedLine, is_comma_full_stop, is_thai_combining, is_thai_leading_vowel,
    wrap_spans_hung,
};
use shojiku_core::facts::{FONT_SIZE, LETTER_SPACING};
use shojiku_core::{HangingPunctuation, LineBreak};

#[cfg(test)]
mod tests;

/// Which branches one input ran, for the replay test's positive controls.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct WrapPaths {
    /// The width rule ran (horizontal, no tate-chu-yoko, `anywhere`, no
    /// hanging, letter spacing not negative).
    pub width_checked: bool,
    /// The width rule ran on a line wider than the box.
    pub over_wide: bool,
    /// The width rule ran on a line wider than the box with at least one
    /// character before its last unit, so the check compared a non-empty
    /// prefix with the box.
    pub over_wide_after_prefix: bool,
    /// Kinsoku or hanging moved a character: the line texts differ from
    /// the same body wrapped with `anywhere` and no hanging.
    pub rule_moved: bool,
    /// A line is marked hung, so the hung-line check ran on it.
    pub hung: bool,
}

/// Wraps one fuzz input and asserts the wrapper's documented properties.
///
/// Settings: `w` (box width), `size` (one per span, comma-separated), `ls`
/// (letter spacing), `lb` (`normal`/`strict`/`loose`/`anywhere`), `hang`
/// (`allow-end`/`force-end`), `orient` (`mixed`/`upright` for vertical
/// text) and `combine` (`all`/`digits2`..`digits4`).
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn wrap(chain: &[FontFace], input: &str) -> WrapPaths {
    let input = Input::parse(input);
    let faces: Vec<&FontFace> = chain.iter().collect();
    let width = input.number("w", LENGTH);
    let sizes = input.numbers("size", FONT_SIZE);
    let letter_spacing = input.number("ls", LETTER_SPACING);
    let line_break = input.line_break();
    let hanging = input.hanging();
    let orient = input.orient();
    let combine = input.combine();
    let spans: Vec<RichSpan> = input
        .spans()
        .into_iter()
        .enumerate()
        .map(|(i, text)| RichSpan {
            text,
            faces: &faces,
            size: sizes[i % sizes.len()],
            letter_spacing,
            orient,
            combine,
        })
        .collect();

    let lines = wrap_spans_hung(&spans, width, line_break, hanging);
    assert!(
        lines == wrap_spans_hung(&spans, width, line_break, hanging),
        "wrapping the same input twice gave different lines"
    );
    assert_conserved(&spans, &lines);
    assert_hung(&lines, hanging);

    let mut paths = WrapPaths {
        hung: lines.iter().any(|line| line.hung),
        ..WrapPaths::default()
    };
    let plain = line_break == LineBreak::Anywhere && hanging == HangingPunctuation::None;
    if plain && orient.is_none() && combine.is_none() && letter_spacing >= 0.0 {
        paths.width_checked = true;
        (paths.over_wide, paths.over_wide_after_prefix) = assert_width(&spans, &lines, width);
    }
    if !plain {
        let free = wrap_spans_hung(&spans, width, LineBreak::Anywhere, HangingPunctuation::None);
        paths.rule_moved = !free
            .iter()
            .map(WrappedLine::text)
            .eq(lines.iter().map(WrappedLine::text));
    }
    paths
}

/// Every non-whitespace character of every span comes out once, in order,
/// in a piece tagged with its span; no piece has a lower span index than
/// the piece before it, and two adjacent pieces of one line never share a
/// span index; no line holds a line feed; and the line count is at least
/// the paragraph count and at most the character count plus the paragraph
/// count.
fn assert_conserved(spans: &[RichSpan], lines: &[WrappedLine]) {
    let mut last_span = 0;
    for line in lines {
        for (i, piece) in line.pieces.iter().enumerate() {
            assert!(
                piece.span >= last_span,
                "a piece has a lower span index than the piece before it"
            );
            assert!(
                i == 0 || line.pieces[i - 1].span != piece.span,
                "two adjacent pieces of one line share a span"
            );
            assert!(
                !piece.text.contains('\n'),
                "a wrapped line holds a line feed"
            );
            last_span = piece.span;
        }
    }
    for (si, span) in spans.iter().enumerate() {
        let wrapped: String = lines
            .iter()
            .flat_map(|line| &line.pieces)
            .filter(|piece| piece.span == si)
            .flat_map(|piece| piece.text.chars())
            .filter(|c| !c.is_whitespace())
            .collect();
        let expected: String = span.text.chars().filter(|c| !c.is_whitespace()).collect();
        assert_eq!(
            wrapped, expected,
            "span {si} lost, gained or reordered a character"
        );
    }
    let text: String = spans.iter().map(|s| s.text).collect();
    let paragraphs = text.split('\n').count();
    let chars = text.chars().filter(|&c| c != '\n').count();
    assert!(lines.len() >= paragraphs, "a paragraph produced no line");
    assert!(
        lines.len() <= chars + paragraphs,
        "more lines than characters plus paragraphs"
    );
}

/// A line is marked hung only when hanging is on, and a hung line ends in
/// the comma or full stop that hangs.
fn assert_hung(lines: &[WrappedLine], hanging: HangingPunctuation) {
    for line in lines.iter().filter(|line| line.hung) {
        assert!(
            hanging != HangingPunctuation::None,
            "a line is hung with hanging off"
        );
        assert!(
            line.text()
                .chars()
                .next_back()
                .is_some_and(is_comma_full_stop),
            "a hung line does not end in a comma or full stop"
        );
    }
}

/// A line wider than `width` overflows only in its last unit that cannot
/// be split: the characters before that unit fit the box. Returns whether
/// some line is wider than `width`, and whether some such line has at least
/// one character before its last unit.
///
/// The width is the wrapper's own measure (one [`char_width`] per
/// character over the character's span). A unit starts at every character
/// boundary except three: before a space or tab, because the wrapper
/// appends spaces to the current line with no width check and never starts
/// a line with one; before a Thai vowel written above or below the
/// character before it, or a Thai tone mark; and between a Thai
/// leading vowel and a following character that is not itself a leading
/// vowel. The wrapper's character-by-character break never breaks at any
/// of the three. The wrapper's greedy fill, which places one token at a
/// time (a Latin word, one CJK character or one Thai segment), breaks at
/// the last two only between tokens, where the line before the token fits,
/// so leaving them out never makes the check fail on a line the wrapper
/// produces.
fn assert_width(spans: &[RichSpan], lines: &[WrappedLine], width: f64) -> (bool, bool) {
    let mut any_over = false;
    let mut any_prefix = false;
    for line in lines {
        let advances: Vec<(char, f64)> = line
            .pieces
            .iter()
            .flat_map(|piece| {
                let span = &spans[piece.span];
                piece
                    .text
                    .chars()
                    .map(|c| (c, char_width(span.faces, c, span.size, span.letter_spacing)))
            })
            .collect();
        let total: f64 = advances.iter().map(|&(_, w)| w).sum();
        if total <= width + slack(width) {
            continue;
        }
        any_over = true;
        let last_unit = (1..advances.len())
            .rev()
            .find(|&i| unit_starts(advances[i - 1].0, advances[i].0))
            .unwrap_or(0);
        let before: f64 = advances[..last_unit].iter().map(|&(_, w)| w).sum();
        assert!(
            before <= width + slack(width),
            "a line overflows before its last unbreakable unit"
        );
        any_prefix |= last_unit > 0;
    }
    (any_over, any_prefix)
}

/// Whether a line may break between `prev` and `c`.
fn unit_starts(prev: char, c: char) -> bool {
    c != ' '
        && c != '\t'
        && !is_thai_combining(c)
        && !(is_thai_leading_vowel(prev) && !is_thai_leading_vowel(c))
}

/// The rounding slack of a sum of advances compared against `width`: the
/// wrapper adds token by token and the harness char by char, so the two
/// sums can differ in the last bits.
fn slack(width: f64) -> f64 {
    1e-9 * width.max(1.0)
}
