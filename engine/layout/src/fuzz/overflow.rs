//! The text-overflow harness the `layout_overflow` fuzz target and the
//! corpus replay test both run.
//!
//! A definite-height text block whose params text does not fit takes one of
//! two policies: `shrink` searches for the largest font size that fits, and
//! `ellipsis` clamps the wrapped lines and ends the last one in `…`; a
//! `list` entry clamps its single line the same way. The harness runs all
//! three over the body and asserts what each documents: the shrunk size
//! stays between the floor and the authored size and fits whenever it is
//! above the floor, and a clamped line is a prefix of the original that
//! fits with its `…` and does not end in an opening bracket or quote.

use super::input::{Input, LENGTH};
use crate::engine::{MIN_SHRINK_FONT_PT, clamp_line, clamp_with_ellipsis, exceeds, fit_font_size};
use crate::font::{FontFace, RunOptions, run_width};
use crate::wrap::{no_line_end, wrap_text_chain};
use shojiku_core::LineBreak;
use shojiku_core::facts::{FONT_SIZE, LETTER_SPACING, LINE_HEIGHT};

#[cfg(test)]
mod tests;

/// The most body characters one input uses. The clamp shapes the whole
/// line again for every character it removes, so its cost grows with the
/// square of the line length; this cap keeps one input far below the
/// fuzzer's per-input timeout.
const MAX_BODY_CHARS: usize = 1024;

/// The most lines the `lines` setting may keep.
const MAX_KEPT_LINES: usize = 64;

/// Which branches one input ran, for the replay test's positive controls.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct OverflowPaths {
    /// The authored size did not fit, and `shrink` returned a size above
    /// the floor, so the check that the size fits ran.
    pub shrunk_above_floor: bool,
    /// The authored size did not fit, and `shrink` returned the floor.
    pub shrunk_to_floor: bool,
    /// The ellipsis clamp removed at least one character from the last kept
    /// line.
    pub clamped: bool,
    /// The ellipsis clamp removed at least one character from the last kept
    /// line and kept a non-empty prefix, so the width and line-end checks
    /// ran on it.
    pub clamped_nonempty: bool,
    /// The single-line clamp shortened a line that did not fit.
    pub single_clamped: bool,
}

/// Runs one fuzz input through both overflow policies and the single-line
/// clamp, and asserts their documented properties.
///
/// Settings: `w` and `h` (the content box), `size`, `lh` (line-height
/// multiplier), `ls` (letter spacing), `lb` (line break mode) and `lines`
/// (the lines the ellipsis clamp keeps).
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn overflow(chain: &[FontFace], input: &str) -> OverflowPaths {
    let input = Input::parse(input);
    let faces: Vec<&FontFace> = chain.iter().collect();
    let content = capped_body(&input);
    let fit = Fit {
        faces: &faces,
        width: input.number("w", LENGTH),
        size: input.number("size", FONT_SIZE),
        letter_spacing: input.number("ls", LETTER_SPACING),
        line_break: input.line_break(),
    };
    let line_height = input.number("lh", LINE_HEIGHT);
    let avail_h = input.number("h", LENGTH);
    let max_lines = input.count("lines", MAX_KEPT_LINES, 2);

    let shrunk = fit.shrink(&content, line_height, avail_h);
    let clamped = fit.clamp(&content, max_lines);
    let first_line = content.split('\n').next().unwrap_or_default();
    OverflowPaths {
        shrunk_above_floor: shrunk.is_some_and(|size| size > MIN_SHRINK_FONT_PT),
        shrunk_to_floor: shrunk == Some(MIN_SHRINK_FONT_PT),
        clamped: clamped.is_some(),
        clamped_nonempty: clamped.is_some_and(|prefix_chars| prefix_chars > 0),
        single_clamped: fit.clamp_single(first_line),
    }
}

/// The body's first [`MAX_BODY_CHARS`] characters.
fn capped_body(input: &Input) -> String {
    input.body.chars().take(MAX_BODY_CHARS).collect()
}

/// The measurement inputs the shrink search and the two clamps share.
struct Fit<'a> {
    faces: &'a [&'a FontFace],
    width: f64,
    size: f64,
    letter_spacing: f64,
    line_break: LineBreak,
}

impl Fit<'_> {
    fn wrap(&self, content: &str, size: f64) -> Vec<String> {
        wrap_text_chain(
            self.faces,
            content,
            size,
            self.width,
            self.line_break,
            self.letter_spacing,
        )
    }

    fn width_of(&self, text: &str) -> f64 {
        run_width(
            self.faces,
            text,
            self.size,
            RunOptions::spacing_only(self.letter_spacing),
        )
    }

    /// Asserts the `shrink` result. Returns the shrunk size, or `None` when
    /// the authored size fits.
    fn shrink(&self, content: &str, line_height: f64, avail_h: f64) -> Option<f64> {
        let shrink = || {
            fit_font_size(
                self.faces,
                content,
                self.size,
                line_height,
                self.width,
                avail_h,
                self.line_break,
                self.letter_spacing,
            )
        };
        let result = shrink();
        assert!(
            result.to_bits() == shrink().to_bits(),
            "shrinking the same input twice gave different sizes"
        );
        let fits = |size: f64| {
            let lines = self.wrap(content, size).len();
            !exceeds(lines as f64 * size * line_height, avail_h)
        };
        if fits(self.size) {
            assert!(result == self.size, "the authored size fits but was shrunk");
            return None;
        }
        assert!(
            (MIN_SHRINK_FONT_PT..=self.size.max(MIN_SHRINK_FONT_PT)).contains(&result),
            "the shrunk size is below the floor or above the larger of the floor and the authored size"
        );
        assert!(
            result == MIN_SHRINK_FONT_PT || fits(result),
            "the shrunk size above the floor does not fit"
        );
        Some(result)
    }

    /// Asserts the ellipsis clamp over the wrapped content. Returns the
    /// character count of the kept prefix when the clamp removed at least
    /// one character, else `None`.
    fn clamp(&self, content: &str, max_lines: usize) -> Option<usize> {
        let lines = self.wrap(content, self.size);
        let clamp = || {
            clamp_with_ellipsis(
                self.faces,
                lines.clone(),
                self.size,
                self.letter_spacing,
                self.width,
                max_lines,
            )
        };
        let clamped = clamp();
        assert!(
            clamped == clamp(),
            "clamping the same input twice gave different lines"
        );
        let kept = max_lines.min(lines.len());
        assert_eq!(
            clamped.len(),
            kept,
            "the clamp kept the wrong number of lines"
        );
        let last = clamped.last()?;
        assert!(
            clamped[..kept - 1] == lines[..kept - 1],
            "the clamp changed a line before the last"
        );
        let original = lines[kept - 1].trim_end();
        let prefix = self.assert_clamped_line(last, original);
        (prefix.len() < original.len()).then(|| prefix.chars().count())
    }

    /// Asserts the single-line clamp a `list` entry uses. Returns whether
    /// the line did not fit and was clamped.
    fn clamp_single(&self, line: &str) -> bool {
        let result = clamp_line(
            self.faces,
            line.to_string(),
            self.size,
            self.letter_spacing,
            self.width,
        );
        if !exceeds(self.width_of(line), self.width) {
            assert_eq!(result, line, "a line that fits was clamped");
            return false;
        }
        self.assert_clamped_line(&result, line.trim_end());
        true
    }

    /// The clamped line is `prefix` + `…`, where `prefix` is a prefix of
    /// `original` and ends in no whitespace; a non-empty `prefix` fits the
    /// box together with `…` and does not end in a character that may not
    /// end a line. Returns `prefix`.
    fn assert_clamped_line<'l>(&self, clamped: &'l str, original: &str) -> &'l str {
        let prefix = clamped
            .strip_suffix('…')
            .expect("a clamped line ends in an ellipsis");
        assert!(
            original.starts_with(prefix),
            "a clamped line is not a prefix of the original"
        );
        assert_eq!(
            prefix,
            prefix.trim_end(),
            "a clamped line keeps trailing whitespace"
        );
        if !prefix.is_empty() {
            assert!(
                !exceeds(self.width_of(prefix) + self.width_of("…"), self.width),
                "a clamped line with its ellipsis is wider than the box"
            );
            assert!(
                !prefix.chars().next_back().is_some_and(no_line_end),
                "a clamped line ends in a character that may not end a line"
            );
        }
        prefix
    }
}
