//! The bounds a numeric style key is held to where it is used, and what an
//! out-of-range value falls back to.
//!
//! These are not parse errors: a template is untrusted, so layout warns and
//! substitutes the fallback rather than refusing the document. Each bound is
//! where a value stops being typography and starts threatening the
//! measurement and stroke math (an advance summed over the content, a line
//! box of size × multiplier).

use crate::length::DEFAULT_FONT_SIZE_PT;
use crate::style::{StyleKey, DEFAULT_LINE_HEIGHT, DEFAULT_STROKE_PT};

/// A closed or half-open interval of admitted values, plus the fallback.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScalarRange {
    pub min: f64,
    /// Whether `min` itself is refused (`fontSize: 0` draws nothing).
    pub min_exclusive: bool,
    pub max: f64,
    /// What a refused value is replaced by.
    pub fallback: f64,
}

impl ScalarRange {
    /// Whether `value` is finite and inside the interval.
    pub fn admits(&self, value: f64) -> bool {
        let above_min = if self.min_exclusive {
            value > self.min
        } else {
            value >= self.min
        };
        value.is_finite() && above_min && value <= self.max
    }
}

/// Font size and line height cap at 1000 each, so their PRODUCT — the
/// tallest line box admitted — is the layout's own 1e6 pt resolution cap.
const MAX_TYPE: f64 = 1_000.0;

/// One stroke cap for `borderWidth` and the `line` width alike, since both
/// reach the renderers' stroke math directly (the A4 long edge is ~842pt).
const MAX_STROKE: f64 = 1_000.0;

/// The `line` item's `style.width`. Unlike `borderWidth` it falls back to
/// the wire default rather than 0: a line that strokes nothing is an item
/// drawing nothing.
pub const LINE_WIDTH: ScalarRange = ScalarRange {
    min: 0.0,
    min_exclusive: false,
    max: MAX_STROKE,
    fallback: DEFAULT_STROKE_PT,
};

/// A paint alpha: [`StyleKey::Opacity`], and the `line` item's
/// `style.opacity`.
pub const OPACITY: ScalarRange = ScalarRange {
    min: 0.0,
    min_exclusive: false,
    max: 1.0,
    fallback: 1.0,
};

/// The bounds `key` is held to, for the keys whose value is a number. For
/// the two lengths (`fontSize`, `letterSpacing`) the bound applies to the
/// RESOLVED pt, so a relative string (`"2em"`) is checked only once layout
/// resolves it. `None` for keyword, colour and string keys, and for
/// `borderRadius`, which is checked after resolution against the box.
pub fn range(key: StyleKey) -> Option<ScalarRange> {
    let (min, min_exclusive, max, fallback) = match key {
        StyleKey::FontSize => (0.0, true, MAX_TYPE, DEFAULT_FONT_SIZE_PT),
        StyleKey::LineHeight => (0.0, true, MAX_TYPE, DEFAULT_LINE_HEIGHT),
        StyleKey::LetterSpacing => (-MAX_TYPE, false, MAX_TYPE, 0.0),
        StyleKey::BorderWidth => (0.0, false, MAX_STROKE, 0.0),
        StyleKey::Opacity => return Some(OPACITY),
        StyleKey::FontFamily
        | StyleKey::Color
        | StyleKey::TextAlign
        | StyleKey::VerticalAlign
        | StyleKey::LineBreak
        | StyleKey::TextSpacingTrim
        | StyleKey::HangingPunctuation
        | StyleKey::BackgroundColor
        | StyleKey::BorderColor
        | StyleKey::BorderStyle
        | StyleKey::BorderRadius
        | StyleKey::TextOverflow
        | StyleKey::FontWeight
        | StyleKey::FontStyle
        | StyleKey::Overflow
        | StyleKey::TextDecoration
        | StyleKey::WritingMode
        | StyleKey::TextOrientation
        | StyleKey::TextCombineUpright => return None,
    };
    Some(ScalarRange {
        min,
        min_exclusive,
        max,
        fallback,
    })
}
