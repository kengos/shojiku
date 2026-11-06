//! The shaping harness the `layout_shape` fuzz target and the corpus replay
//! test both run.
//!
//! [`shape_run`] is the one place a run of params text becomes positioned
//! glyphs, for measurement and for both renderers, and the PDF renderer
//! writes each glyph's `source` range into the ToUnicode map. The harness
//! shapes the body over the fuzzed fallback chain and asserts what the
//! shaper documents: every source range is an ordered range inside the
//! text on character boundaries and together they cover it, the pen
//! positions are the running sum of the advances, every glyph id exists in
//! the face that drew it, and trimming keeps every glyph and never widens
//! one. It also checks that the
//! glyph count stays within harfrust's buffer cap, a guard against a
//! harfrust change rather than a property of this crate's code.

use super::input::Input;
use crate::font::{FontFace, PositionedGlyph, RunOptions, all_missing, itemize, shape_run};
use shojiku_core::TextSpacingTrim;
use shojiku_core::facts::{FONT_SIZE, LETTER_SPACING};

#[cfg(test)]
mod tests;

/// harfrust's buffer cap: a shaped buffer may grow to this many times its
/// input length, and never below [`MIN_GLYPH_CAP`] (harfrust 0.14.0
/// `Buffer::MAX_LEN_FACTOR` and `Buffer::MAX_LEN_MIN`, read from its
/// source). A buffer that grows past it is marked failed and the segment
/// falls back to one glyph per character, so the glyph-count check fails
/// only if harfrust stops enforcing the cap.
const GLYPH_CAP_FACTOR: usize = 256;
const MIN_GLYPH_CAP: usize = 65_536;

/// Which branches one input ran, for the replay test's positive controls.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct ShapePaths {
    /// A segment some chain face covers, which is shaped by harfrust unless
    /// harfrust marks its buffer as failed.
    pub shaped: bool,
    /// A character no chain face maps, which takes the per-character path.
    pub missing: bool,
    /// Trimming made at least one glyph narrower.
    pub trimmed: bool,
}

/// Shapes one fuzz input and asserts the shaper's documented properties.
///
/// Settings: `size`, `ls` (letter spacing), `trim` (`normal`/`trim-start`)
/// and `start=true` (the run begins its line).
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn shape(chain: &[FontFace], input: &str) -> ShapePaths {
    let input = Input::parse(input);
    let faces: Vec<&FontFace> = chain.iter().collect();
    let text = input.body;
    let size = input.number("size", FONT_SIZE);
    let opts = RunOptions {
        letter_spacing: input.number("ls", LETTER_SPACING),
        trim: input.trim(),
        line_start: input.flag("start"),
        combine: None,
    };

    let glyphs = shape_run(&faces, text, size, opts);
    assert!(
        glyphs == shape_run(&faces, text, size, opts),
        "shaping the same input twice gave different glyphs"
    );
    assert_sources(text, &glyphs);
    assert_pen(&glyphs);
    assert_glyph_ids(&faces, &glyphs);

    let segments = itemize(&faces, text);
    let cap: usize = segments
        .iter()
        .map(|seg| (text[seg.range.clone()].chars().count() * GLYPH_CAP_FACTOR).max(MIN_GLYPH_CAP))
        .sum();
    assert!(
        glyphs.len() <= cap,
        "more glyphs than the shaper's buffer cap"
    );

    let mut paths = ShapePaths {
        shaped: segments.iter().any(|seg| seg.face.is_some()),
        missing: text.chars().any(|c| all_missing(&faces, c)),
        trimmed: false,
    };
    if opts.trim != TextSpacingTrim::SpaceAll {
        let untrimmed = shape_run(
            &faces,
            text,
            size,
            RunOptions::spacing_only(opts.letter_spacing),
        );
        paths.trimmed = assert_trim_narrows(&glyphs, &untrimmed);
    }
    paths
}

/// Every source range is ordered, inside the text and on character
/// boundaries, and the ranges together cover the whole text: every
/// character lies inside at least one glyph's source range.
fn assert_sources(text: &str, glyphs: &[PositionedGlyph]) {
    for g in glyphs {
        assert!(g.source.start <= g.source.end, "a source range is inverted");
        assert!(
            g.source.end <= text.len(),
            "a source range ends past the text"
        );
        assert!(
            text.is_char_boundary(g.source.start) && text.is_char_boundary(g.source.end),
            "a source range splits a character"
        );
    }
    let mut ranges: Vec<_> = glyphs.iter().map(|g| g.source.clone()).collect();
    ranges.sort_by_key(|r| r.start);
    let mut covered = 0;
    for r in ranges {
        assert!(
            r.start <= covered,
            "a character is in no glyph's source range"
        );
        covered = covered.max(r.end);
    }
    assert_eq!(
        covered,
        text.len(),
        "the text's tail is in no glyph's source range"
    );
}

/// Each glyph's `x` is the sum of the advances before it, and every
/// position is finite.
fn assert_pen(glyphs: &[PositionedGlyph]) {
    let mut pen = 0.0;
    for g in glyphs {
        assert!(
            [g.x, g.advance, g.x_offset, g.y_offset]
                .iter()
                .all(|v| v.is_finite()),
            "a glyph position is not finite"
        );
        assert!(
            g.x == pen,
            "a glyph's x is not the sum of the advances before it"
        );
        pen += g.advance;
    }
}

/// Every glyph names a chain face, and a glyph id that face declares.
fn assert_glyph_ids(faces: &[&FontFace], glyphs: &[PositionedGlyph]) {
    let counts: Vec<u32> = faces
        .iter()
        .map(|face| {
            face.glyph_count()
                .expect("a chain face declares its glyph count")
        })
        .collect();
    for g in glyphs {
        let count = *counts
            .get(g.face_index)
            .expect("a glyph's face is in the chain");
        assert!(
            g.glyph_id < count,
            "a glyph id is past its face's glyph count"
        );
    }
}

/// Trimming keeps every glyph (its id, source range and face) and never
/// widens one. Returns whether it narrowed one.
fn assert_trim_narrows(trimmed: &[PositionedGlyph], untrimmed: &[PositionedGlyph]) -> bool {
    assert_eq!(
        trimmed.len(),
        untrimmed.len(),
        "trimming changed the glyph count"
    );
    let mut narrowed = false;
    for (t, u) in trimmed.iter().zip(untrimmed) {
        assert!(
            (t.glyph_id, &t.source, t.face_index) == (u.glyph_id, &u.source, u.face_index),
            "trimming replaced a glyph"
        );
        assert!(t.advance <= u.advance, "trimming widened a glyph");
        narrowed |= t.advance < u.advance;
    }
    narrowed
}
