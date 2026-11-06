//! The input shape the three text harnesses share, and the font chain they
//! measure with.
//!
//! A fuzz input is text: the first line holds `key=value` settings separated
//! by whitespace, and everything after the first line feed is the body. A
//! setting that is missing, does not parse, or lies outside the range the
//! engine's own style guards admit (`shojiku_core::facts`) takes the
//! fallback, so every input gives the measured functions only values a
//! layout pass could pass to them.

use crate::font::FontFace;
use shojiku_core::facts::ScalarRange;
use shojiku_core::{HangingPunctuation, LineBreak, TextCombine, TextOrientation, TextSpacingTrim};
use shojiku_layout_box::MAX_RESOLVED_PT;
use std::path::Path;

#[cfg(test)]
mod tests;

/// The faces of the fuzzed fallback chain, in chain order, relative to the
/// repository's `packs/fonts` directory. [`text_chain`] says why these.
const CHAIN_FILES: [&str; 4] = [
    "noto-sans/NotoSans-Regular.ttf",
    "biz-ud/BIZUDGothic-Regular.ttf",
    "noto-sans-thai/NotoSansThai-Regular.ttf",
    "noto-sans-devanagari/NotoSansDevanagari-Regular.ttf",
];

/// A box length in pt: a width or a height, from zero to the engine's
/// resolved-length cap.
pub(super) const LENGTH: ScalarRange = ScalarRange {
    min: 0.0,
    min_exclusive: false,
    max: MAX_RESOLVED_PT,
    fallback: 100.0,
};

/// The rich-span separator in a fuzz body (U+001E, RECORD SEPARATOR).
const SPAN_SEPARATOR: char = '\u{1e}';

/// The most rich spans one body is split into; the rest of the body stays
/// in the last span.
const MAX_SPANS: usize = 4;

/// Loads the fuzzed fallback chain from a `packs/fonts` directory: Latin
/// with kerning and ligatures (Noto Sans), Japanese (BIZ UD Gothic), Thai
/// and Devanagari (reordering clusters), in that order.
///
/// The Japanese face is the fixed-width BIZ UD Gothic rather than the ja-JP
/// default BIZ UDP Gothic: the proportional face's brackets are already
/// half an em wide, so `textSpacingTrim` would never narrow a glyph and the
/// shape harness's `trimmed` result would never be true. The IPAmj Mincho
/// face is left out: it adds only rare kanji beyond BIZ UD Gothic, and every
/// fuzz process would read and parse its 47 MB at start-up.
///
/// # Panics
///
/// Panics when a chain face is missing or does not parse: the harness has
/// nothing to measure with, and a silent fallback would fuzz a different
/// chain than the one documented.
pub fn text_chain(fonts_dir: &Path) -> Vec<FontFace> {
    CHAIN_FILES
        .iter()
        .map(|file| FontFace::load(*file, &fonts_dir.join(file)).expect("a chain face loads"))
        .collect()
}

/// The fuzzed chain, loaded once per unit-test binary.
#[cfg(test)]
pub(super) fn test_chain() -> &'static [FontFace] {
    static CHAIN: std::sync::OnceLock<Vec<FontFace>> = std::sync::OnceLock::new();
    CHAIN.get_or_init(|| text_chain(&crate::font::test_support::repo_font_dir()))
}

/// One fuzz input split into its settings line and its body.
pub(super) struct Input<'a> {
    settings: &'a str,
    pub(super) body: &'a str,
}

impl<'a> Input<'a> {
    pub(super) fn parse(input: &'a str) -> Self {
        let (settings, body) = input.split_once('\n').unwrap_or((input, ""));
        Input { settings, body }
    }

    /// The raw value of `key`, if the settings line names it.
    fn value(&self, key: &str) -> Option<&'a str> {
        self.settings
            .split_whitespace()
            .find_map(|pair| pair.strip_prefix(key)?.strip_prefix('='))
    }

    /// `key` as a number inside `range`, else the range's fallback.
    pub(super) fn number(&self, key: &str, range: ScalarRange) -> f64 {
        admitted(self.value(key), range)
    }

    /// `key` as a comma-separated list of numbers inside `range`, one per
    /// rich span; an entry outside the range takes the fallback, and a
    /// missing key is a one-entry list of the fallback.
    pub(super) fn numbers(&self, key: &str, range: ScalarRange) -> Vec<f64> {
        let Some(list) = self.value(key) else {
            return vec![range.fallback];
        };
        list.split(',')
            .map(|entry| admitted(Some(entry), range))
            .collect()
    }

    /// `key` as a count no larger than `max`, else `fallback`.
    pub(super) fn count(&self, key: &str, max: usize, fallback: usize) -> usize {
        self.value(key)
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|n| *n <= max)
            .unwrap_or(fallback)
    }

    pub(super) fn line_break(&self) -> LineBreak {
        match self.value("lb") {
            Some("strict") => LineBreak::Strict,
            Some("loose") => LineBreak::Loose,
            Some("anywhere") => LineBreak::Anywhere,
            _ => LineBreak::Normal,
        }
    }

    pub(super) fn hanging(&self) -> HangingPunctuation {
        match self.value("hang") {
            Some("allow-end") => HangingPunctuation::AllowEnd,
            Some("force-end") => HangingPunctuation::ForceEnd,
            _ => HangingPunctuation::None,
        }
    }

    /// The vertical orientation, or `None` for horizontal text.
    pub(super) fn orient(&self) -> Option<TextOrientation> {
        match self.value("orient") {
            Some("mixed") => Some(TextOrientation::Mixed),
            Some("upright") => Some(TextOrientation::Upright),
            _ => None,
        }
    }

    /// The tate-chu-yoko setting: `all`, or `digits<N>` for N in 2..=4.
    pub(super) fn combine(&self) -> Option<TextCombine> {
        match self.value("combine")? {
            "all" => Some(TextCombine::All),
            other => other
                .strip_prefix("digits")?
                .parse::<u8>()
                .ok()
                .filter(|n| (2..=4).contains(n))
                .map(TextCombine::Digits),
        }
    }

    pub(super) fn trim(&self) -> TextSpacingTrim {
        match self.value("trim") {
            Some("normal") => TextSpacingTrim::Normal,
            Some("trim-start") => TextSpacingTrim::TrimStart,
            _ => TextSpacingTrim::SpaceAll,
        }
    }

    /// Whether `key` is set to `true`.
    pub(super) fn flag(&self, key: &str) -> bool {
        self.value(key) == Some("true")
    }

    /// The body split into at most [`MAX_SPANS`] rich-span texts.
    pub(super) fn spans(&self) -> Vec<&'a str> {
        self.body.splitn(MAX_SPANS, SPAN_SEPARATOR).collect()
    }
}

fn admitted(value: Option<&str>, range: ScalarRange) -> f64 {
    value
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| range.admits(*v))
        .unwrap_or(range.fallback)
}
